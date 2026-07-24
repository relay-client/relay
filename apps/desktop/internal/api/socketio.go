package api

import (
	"context"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/relay-client/relay/apps/desktop/internal/api/auth"
	"github.com/relay-client/relay/apps/desktop/internal/model"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

const (
	eioOpen    = byte('0')
	eioClose   = byte('1')
	eioPing    = byte('2')
	eioPong    = byte('3')
	eioMessage = byte('4')
	eioUpgrade = byte('5')
)

const (
	sioConnect      = byte('0')
	sioDisconnect   = byte('1')
	sioEvent        = byte('2')
	sioAck          = byte('3')
	sioConnectError = byte('4')
)

type eioOpenData struct {
	SID          string `json:"sid"`
	PingInterval int    `json:"pingInterval"`
	PingTimeout  int    `json:"pingTimeout"`
}

type socketIOSession struct {
	cancel  context.CancelFunc
	conn    *websocket.Conn
	id      uint64
	writeMu sync.Mutex
}

type socketIOCallbacks struct {
	onOpen      func(model.SocketIOOpenEvent)
	onEvent     func(model.SocketIOMessage)
	onClose     func(model.SocketIOCloseEvent)
	onError     func(model.SocketIOErrorEvent)
	onReconnect func(model.SocketIOReconnectEvent)
	onAck       func(model.SocketIOAckEvent)
}

type socketIOManager struct {
	mu          sync.Mutex
	sessions    map[string]*socketIOSession
	seq         uint64
	jars        *cookieJarRegistry
	ackMu       sync.Mutex
	ackCounters map[string]int
	pendingAcks map[string]map[int]pendingSocketIOAck
}

type pendingSocketIOAck struct {
	eventName string
	ch        chan model.SocketIOAckEvent
}

// socketIOAckTimeout bounds how long an emitted-with-ack entry is retained while
// waiting for the server's ack. Without eviction a server that never acks would
// grow pendingAcks for the session's lifetime. Package var so tests can shorten it.
var socketIOAckTimeout = 60 * time.Second

func newSocketIOManager(jars *cookieJarRegistry) *socketIOManager {
	if jars == nil {
		jars = newCookieJarRegistry()
	}
	return &socketIOManager{
		sessions:    make(map[string]*socketIOSession),
		jars:        jars,
		ackCounters: make(map[string]int),
		pendingAcks: make(map[string]map[int]pendingSocketIOAck),
	}
}

func (m *socketIOManager) connect(appCtx context.Context, sessionID string, req model.HttpRequest) {
	m.connectWithCallbacks(appCtx, sessionID, req, m.runtimeCallbacks(appCtx, sessionID))
}

func (m *socketIOManager) connectWithCallbacks(appCtx context.Context, sessionID string, req model.HttpRequest, callbacks socketIOCallbacks) {
	sioCtx, cancel := context.WithCancel(appCtx)

	m.mu.Lock()
	if existing, ok := m.sessions[sessionID]; ok {
		existing.cancel()
		if existing.conn != nil {
			_ = existing.conn.Close()
		}
	}
	m.seq++
	seq := m.seq
	m.sessions[sessionID] = &socketIOSession{cancel: cancel, id: seq}
	m.mu.Unlock()

	go func() {
		defer func() {
			if r := recover(); r != nil {
				log.Printf("relay: Socket.IO session %s panicked: %v", sessionID, r)
			}
			cleared := false
			m.mu.Lock()
			if sess, ok := m.sessions[sessionID]; ok && sess.id == seq {
				delete(m.sessions, sessionID)
				cleared = true
			}
			m.mu.Unlock()
			if cleared {
				m.clearPendingAcks(sessionID)
			}
		}()
		m.runConnectionWithCallbacks(sioCtx, sessionID, seq, req, callbacks)
	}()
}

func (m *socketIOManager) disconnect(sessionID string) {
	m.mu.Lock()
	if sess, ok := m.sessions[sessionID]; ok {
		sess.cancel()
		if sess.conn != nil {
			_ = sess.conn.Close()
		}
		delete(m.sessions, sessionID)
	}
	m.mu.Unlock()
	m.clearPendingAcks(sessionID)
}

func (m *socketIOManager) disconnectAll() {
	m.mu.Lock()
	sessions := m.sessions
	m.sessions = make(map[string]*socketIOSession)
	m.mu.Unlock()
	for _, sess := range sessions {
		sess.cancel()
		if sess.conn != nil {
			_ = sess.conn.Close()
		}
	}
	m.ackMu.Lock()
	m.pendingAcks = make(map[string]map[int]pendingSocketIOAck)
	m.ackCounters = make(map[string]int)
	m.ackMu.Unlock()
}

func (m *socketIOManager) clearPendingAcks(sessionID string) {
	m.ackMu.Lock()
	delete(m.pendingAcks, sessionID)
	delete(m.ackCounters, sessionID)
	m.ackMu.Unlock()
}

func (m *socketIOManager) registerPendingAck(sessionID, eventName string) (int, chan model.SocketIOAckEvent) {
	m.ackMu.Lock()
	m.ackCounters[sessionID]++
	ackID := m.ackCounters[sessionID]
	ackCh := make(chan model.SocketIOAckEvent, 1)
	if m.pendingAcks[sessionID] == nil {
		m.pendingAcks[sessionID] = make(map[int]pendingSocketIOAck)
	}
	m.pendingAcks[sessionID][ackID] = pendingSocketIOAck{eventName: eventName, ch: ackCh}
	m.ackMu.Unlock()
	m.scheduleAckEviction(sessionID, ackID)
	return ackID, ackCh
}

func (m *socketIOManager) scheduleAckEviction(sessionID string, ackID int) {
	if socketIOAckTimeout <= 0 {
		return
	}
	time.AfterFunc(socketIOAckTimeout, func() {
		m.ackMu.Lock()
		if pending, ok := m.pendingAcks[sessionID]; ok {
			delete(pending, ackID)
		}
		m.ackMu.Unlock()
	})
}

func (m *socketIOManager) pendingAckCount(sessionID string) int {
	m.ackMu.Lock()
	defer m.ackMu.Unlock()
	return len(m.pendingAcks[sessionID])
}

func (m *socketIOManager) emit(sessionID string, msg model.SocketIOEmitMessage) model.SocketIOEmitResult {
	m.mu.Lock()
	sess, ok := m.sessions[sessionID]
	var conn *websocket.Conn
	if ok {
		conn = sess.conn
	}
	m.mu.Unlock()
	if !ok || conn == nil {
		return model.SocketIOEmitResult{Error: "Socket.IO is not connected"}
	}

	namespace := msg.Namespace
	if namespace == "" {
		namespace = "/"
	}
	eventName := msg.EventName
	if eventName == "" {
		eventName = "message"
	}

	arr := make([]interface{}, 0, 1+len(msg.Args))
	arr = append(arr, eventName)
	for _, a := range msg.Args {
		var v interface{}
		if json.Unmarshal([]byte(a), &v) == nil {
			arr = append(arr, v)
		} else {
			arr = append(arr, a)
		}
	}
	argsJSON, err := json.Marshal(arr)
	if err != nil {
		return model.SocketIOEmitResult{Error: "failed to encode args: " + err.Error()}
	}

	var ackID int
	var ackCh chan model.SocketIOAckEvent
	if msg.Ack {
		ackID, ackCh = m.registerPendingAck(sessionID, eventName)
	}

	var packet string
	packetType := string(eioMessage) + string(sioEvent)
	ackStr := ""
	if msg.Ack {
		ackStr = fmt.Sprintf("%d", ackID)
	}
	if namespace == "/" {
		packet = packetType + ackStr + string(argsJSON)
	} else {
		packet = packetType + namespace + "," + ackStr + string(argsJSON)
	}

	sess.writeMu.Lock()
	err = conn.WriteMessage(websocket.TextMessage, []byte(packet))
	sess.writeMu.Unlock()
	if err != nil {
		if ackCh != nil {
			m.ackMu.Lock()
			delete(m.pendingAcks[sessionID], ackID)
			m.ackMu.Unlock()
		}
		return model.SocketIOEmitResult{Error: err.Error()}
	}
	return model.SocketIOEmitResult{OK: true, AckID: ackID}
}

func (m *socketIOManager) runtimeCallbacks(appCtx context.Context, sessionID string) socketIOCallbacks {
	const batchWindow = 50 * time.Millisecond
	const maxBatchSize = 100

	batch := newEventBatcher[model.SocketIOMessage](maxBatchSize, batchWindow,
		func(ev model.SocketIOMessage) {
			runtime.EventsEmit(appCtx, "sio:event", model.SocketIOPayload{SessionID: sessionID, Event: ev})
		},
		func(events []model.SocketIOMessage) {
			runtime.EventsEmit(appCtx, "sio:events", model.SocketIOBatchPayload{SessionID: sessionID, Events: events})
		},
	)

	return socketIOCallbacks{
		onOpen: func(ev model.SocketIOOpenEvent) {
			runtime.EventsEmit(appCtx, "sio:open", ev)
		},
		onEvent: func(ev model.SocketIOMessage) {
			batch.add(ev)
		},
		onClose: func(ev model.SocketIOCloseEvent) {
			batch.flush()
			runtime.EventsEmit(appCtx, "sio:close", ev)
		},
		onError: func(ev model.SocketIOErrorEvent) {
			batch.flush()
			runtime.EventsEmit(appCtx, "sio:error", ev)
		},
		onReconnect: func(ev model.SocketIOReconnectEvent) {
			batch.flush()
			runtime.EventsEmit(appCtx, "sio:reconnecting", ev)
		},
		onAck: func(ev model.SocketIOAckEvent) {
			runtime.EventsEmit(appCtx, "sio:ack", ev)
		},
	}
}

func (m *socketIOManager) runConnectionWithCallbacks(ctx context.Context, sessionID string, seq uint64, req model.HttpRequest, callbacks socketIOCallbacks) {
	attempts := websocketReconnectAttempts(req)
	for attempt := 0; ; attempt++ {
		shouldRetry := m.runConnectionOnce(ctx, sessionID, seq, req, callbacks)
		if !shouldRetry || ctx.Err() != nil || attempt >= attempts {
			return
		}
		interval := websocketReconnectInterval(req)
		if callbacks.onReconnect != nil {
			callbacks.onReconnect(model.SocketIOReconnectEvent{
				SessionID:   sessionID,
				Attempt:     attempt + 1,
				MaxAttempts: attempts,
				IntervalMs:  int(interval / time.Millisecond),
				Timestamp:   time.Now().UnixMilli(),
			})
		}
		if interval > 0 {
			select {
			case <-time.After(interval):
			case <-ctx.Done():
				return
			}
		}
	}
}

func (m *socketIOManager) runConnectionOnce(ctx context.Context, sessionID string, seq uint64, req model.HttpRequest, callbacks socketIOCallbacks) bool {
	emitErrorHS := func(msg string, hs *model.SocketIOHandshake) {
		callbacks.onError(model.SocketIOErrorEvent{SessionID: sessionID, Message: msg, Timestamp: time.Now().UnixMilli(), Handshake: hs})
	}
	emitError := func(msg string) { emitErrorHS(msg, nil) }
	emitClose := func(message string) {
		callbacks.onClose(model.SocketIOCloseEvent{SessionID: sessionID, Message: message, Timestamp: time.Now().UnixMilli()})
	}
	newSysMsg := func(isErr bool, message string) model.SocketIOMessage {
		return model.SocketIOMessage{
			ID: newEventID(), Direction: "system", Namespace: "/",
			Timestamp: time.Now().UnixMilli(), IsSystem: true, IsError: isErr, Message: message,
		}
	}
	newEventMsg := func(dir, ns, eventName string, args []string) model.SocketIOMessage {
		return model.SocketIOMessage{
			ID: newEventID(), Direction: dir, EventName: eventName, Args: args, Namespace: ns,
			Timestamp: time.Now().UnixMilli(),
		}
	}

	if strings.Contains(req.URL, "{{") {
		emitError("URL contains an unresolved variable — make sure all {{variables}} are defined in the active environment")
		return false
	}

	var allowedEvents map[string]bool
	if req.SocketIOListenEvents != nil {
		allowedEvents = make(map[string]bool, len(req.SocketIOListenEvents))
		for _, e := range req.SocketIOListenEvents {
			allowedEvents[e] = true
		}
	}

	isV2 := strings.EqualFold(req.SocketIOClientVersion, "v2") || req.SocketIOClientVersion == "2"
	eioVer := "4"
	if isV2 {
		eioVer = "3"
	}

	sioPath := req.SocketIOPath
	if sioPath == "" {
		sioPath = "/socket.io"
	}
	namespace := req.SocketIONamespace
	if namespace == "" {
		namespace = "/"
	}

	baseURL, err := buildSocketIOBaseURL(req.URL)
	if err != nil {
		emitError(err.Error())
		return false
	}

	headers := make(http.Header)
	if browserSecurityActive(req) {
		headers.Set("User-Agent", browserLikeUserAgent)
	} else {
		headers.Set("User-Agent", "Relay/"+appVersion)
	}
	applyUserHeaders(headers, req.Headers)
	httpReq := &http.Request{Method: http.MethodGet, URL: cloneURL(baseURL), Header: headers}
	if err := auth.Apply(httpReq, req.Auth); err != nil {
		emitError("auth error: " + err.Error())
		return false
	}

	wsURLProbe := buildSocketIOWSURL(baseURL, sioPath, eioVer, "")
	browserCtx, err := prepareBrowserSecurity(req, headers, wsURLProbe, browserKindHandshake)
	if err != nil {
		emitError(err.Error())
		return false
	}
	if msg := validateBrowserCSP(req, wsURLProbe, browserCtx); msg != "" {
		emitError("CSP error: " + msg)
		return false
	}
	if isV2 {
		pollingTarget := socketIOPollingURL(baseURL, sioPath)
		if msg := validateBrowserCSP(req, pollingTarget, browserCtx); msg != "" {
			emitError("CSP error: " + msg)
			return false
		}
	}
	skipCookieJar := req.DisableCookieJar
	if browserCtx.active && browserCtx.crossOrigin && !browserCtx.withCredentials {
		skipCookieJar = true
		headers.Del("Cookie")
	}

	var sid string
	pingInterval := 25 * time.Second
	pingTimeout := 20 * time.Second

	if isV2 {
		var pollHS *model.SocketIOHandshake
		pollReq := req
		if skipCookieJar {
			pollReq.DisableCookieJar = true
		}
		sid, pingInterval, pingTimeout, pollHS, err = m.pollingHandshake(ctx, pollReq, baseURL, sioPath, httpReq.Header)
		if err != nil {
			if ctx.Err() != nil {
				emitClose("Disconnected")
				return false
			}
			emitErrorHS("Socket.IO handshake failed: "+socketIOConnectionError(err, baseURL, websocketHandshakeTimeout(req)), pollHS)
			return false
		}
	}

	wsURL := buildSocketIOWSURL(baseURL, sioPath, eioVer, sid)
	applyQueryParams(wsURL, req)
	displayURL := socketIODisplayURL(wsURL)

	dialer := websocket.Dialer{
		Proxy:            proxyForRequest(req),
		HandshakeTimeout: websocketHandshakeTimeout(req),
	}
	var sioJar *trackedCookieJar
	if !skipCookieJar {
		sioJar = m.jars.jar(req.WorkspaceID)
	}
	if sioJar != nil {
		if cookieURL := socketIOCookieURL(baseURL); cookieURL != nil {
			for _, cookie := range sioJar.Cookies(cookieURL) {
				httpReq.AddCookie(cookie)
			}
		}
	}
	// Pin TLS 1.2+ regardless of cert-verification opt-out.
	if !req.EnableSSLVerification {
		dialer.TLSClientConfig = &tls.Config{InsecureSkipVerify: true, MinVersion: tls.VersionTLS12}
	} else {
		dialer.TLSClientConfig = &tls.Config{MinVersion: tls.VersionTLS12}
	}

	reqHeadersList := headersToList(httpReq.Header)
	conn, resp, err := dialer.DialContext(ctx, wsURL.String(), httpReq.Header)
	if err != nil {
		if ctx.Err() != nil {
			emitClose("Disconnected")
			return false
		}
		errMsg := err.Error()
		var hs *model.SocketIOHandshake
		if resp != nil {
			errMsg = fmt.Sprintf("Unexpected server response: %d", resp.StatusCode)
			hs = &model.SocketIOHandshake{
				URL:             displayURL,
				Method:          "GET",
				StatusCode:      resp.StatusCode,
				StatusText:      resp.Status,
				RequestHeaders:  reqHeadersList,
				ResponseHeaders: headersToList(resp.Header),
			}
		} else {
			errMsg = socketIOConnectionError(err, wsURL, websocketHandshakeTimeout(req))
		}
		callbacks.onError(model.SocketIOErrorEvent{
			SessionID: sessionID, Message: errMsg, Timestamp: time.Now().UnixMilli(), Handshake: hs,
		})
		return false
	}
	if sioJar != nil && resp != nil {
		if cookieURL := socketIOCookieURL(baseURL); cookieURL != nil {
			sioJar.SetCookies(cookieURL, resp.Cookies())
		}
	}

	openRespHeaders := headersToList(resp.Header)
	openStatusCode := 101
	openStatusText := "101 Switching Protocols"
	if resp != nil {
		openStatusCode = resp.StatusCode
		openStatusText = resp.Status
	}

	defer func() {
		_ = conn.Close()
		m.mu.Lock()
		if sess, ok := m.sessions[sessionID]; ok && sess.id == seq && sess.conn == conn {
			sess.conn = nil
		}
		m.mu.Unlock()
	}()
	if limit := websocketReadLimit(req); limit > 0 {
		conn.SetReadLimit(limit)
	}

	m.mu.Lock()
	sess, ok := m.sessions[sessionID]
	if !ok || sess.id != seq {
		m.mu.Unlock()
		return false
	}
	sess.conn = conn
	m.mu.Unlock()

	writeText := func(data []byte) error {
		sess.writeMu.Lock()
		defer sess.writeMu.Unlock()
		return conn.WriteMessage(websocket.TextMessage, data)
	}

	if isV2 {

		if err := writeText([]byte{eioPing, 'p', 'r', 'o', 'b', 'e'}); err != nil {
			emitError("probe failed: " + err.Error())
			return false
		}
		_, probeResp, err := conn.ReadMessage()
		if err != nil || len(probeResp) < 1 || probeResp[0] != eioPong {
			emitError("probe response invalid")
			return false
		}
		if err := writeText([]byte{eioUpgrade}); err != nil {
			emitError("upgrade signal failed: " + err.Error())
			return false
		}

		// Scope the keep-alive ping to this connection attempt. Deriving from the
		// session ctx (and not cancelling per attempt) leaked one ping goroutine
		// per reconnect — they kept writing to closed conns until full disconnect.
		pingCtx, stopPing := context.WithCancel(ctx)
		defer stopPing()
		go func() {
			ticker := time.NewTicker(pingInterval)
			defer ticker.Stop()
			for {
				select {
				case <-ticker.C:
					_ = writeText([]byte{eioPing})
				case <-pingCtx.Done():
					return
				}
			}
		}()
	} else {

		_, data, err := conn.ReadMessage()
		if err != nil {
			if ctx.Err() != nil {
				emitClose("Disconnected")
				return false
			}
			emitError("failed to read Engine.IO OPEN: " + err.Error())
			return false
		}
		if len(data) < 1 || data[0] != eioOpen {
			emitError(fmt.Sprintf("unexpected Engine.IO packet (expected OPEN): %q", truncate(string(data), 80)))
			return false
		}
		var openData eioOpenData
		if err := json.Unmarshal(data[1:], &openData); err == nil {
			if openData.PingInterval > 0 {
				pingInterval = time.Duration(openData.PingInterval) * time.Millisecond
			}
			if openData.PingTimeout > 0 {
				pingTimeout = time.Duration(openData.PingTimeout) * time.Millisecond
			}
		}
	}

	connectPkt := sioConnectPacket(namespace)
	if err := writeText([]byte(connectPkt)); err != nil {
		emitError("namespace connect failed: " + err.Error())
		return false
	}

	connected := false
	readDeadline := pingInterval + pingTimeout

	for {
		if !isV2 {
			_ = conn.SetReadDeadline(time.Now().Add(readDeadline))
		}
		msgType, data, err := conn.ReadMessage()
		_ = conn.SetReadDeadline(time.Time{})

		if err != nil {
			if ctx.Err() != nil {
				emitClose("Disconnected")
				return false
			}
			if closeErr, ok := err.(*websocket.CloseError); ok {
				emitClose(websocketCloseMessage(closeErr))
				return websocketShouldReconnect(req, closeErr.Code)
			}
			emitError("read error: " + err.Error())
			return websocketReadErrorShouldReconnect(req, err)
		}
		if msgType != websocket.TextMessage || len(data) == 0 {
			continue
		}

		switch data[0] {
		case eioClose:
			emitClose("Server closed the connection")
			return false

		case eioPing:

			_ = writeText([]byte{eioPong})

		case eioPong:

		case eioMessage:
			if len(data) < 2 {
				continue
			}
			sioData := data[1:]
			switch sioData[0] {
			case sioConnect:
				ns, _ := parseSIONamespace(sioData[1:])
				if ns == "" {
					ns = namespace
				}
				if !connected {
					connected = true
					callbacks.onOpen(model.SocketIOOpenEvent{
						SessionID:       sessionID,
						URL:             displayURL,
						Namespace:       ns,
						Timestamp:       time.Now().UnixMilli(),
						RequestHeaders:  reqHeadersList,
						ResponseHeaders: openRespHeaders,
						StatusCode:      openStatusCode,
						StatusText:      openStatusText,
					})
				}

			case sioDisconnect:
				ns, _ := parseSIONamespace(sioData[1:])
				if ns == "" {
					ns = namespace
				}
				callbacks.onEvent(newSysMsg(false, "Disconnected from "+ns))
				emitClose("Socket.IO disconnected by server")
				return false

			case sioEvent:
				ns, rest := parseSIONamespace(sioData[1:])
				if ns == "" {
					ns = namespace
				}
				eventName, args := parseSIOEvent(rest)
				if allowedEvents == nil || allowedEvents[eventName] {
					callbacks.onEvent(newEventMsg("incoming", ns, eventName, args))
				}

			case sioAck:
				ns, rest := parseSIONamespace(sioData[1:])
				if ns == "" {
					ns = namespace
				}
				ackIDVal, args := parseSIOAck(rest)
				eventNameStr := ""
				var ackCh chan model.SocketIOAckEvent
				m.ackMu.Lock()
				if pending, ok := m.pendingAcks[sessionID][ackIDVal]; ok {
					eventNameStr = pending.eventName
					ackCh = pending.ch
					delete(m.pendingAcks[sessionID], ackIDVal)
				}
				m.ackMu.Unlock()
				ev := model.SocketIOAckEvent{SessionID: sessionID, EventName: eventNameStr, Args: args, AckID: ackIDVal, Namespace: ns, Timestamp: time.Now().UnixMilli()}
				if callbacks.onAck != nil {
					callbacks.onAck(ev)
				}
				if ackCh != nil {
					ackCh <- ev
				}

			case sioConnectError:
				_, rest := parseSIONamespace(sioData[1:])
				errMsg := parseSIOConnectError(rest)
				callbacks.onEvent(newSysMsg(true, "Connect error: "+errMsg))
				emitError("Socket.IO connect error: " + errMsg)
				return false
			}
		}
	}
}

func (m *socketIOManager) pollingHandshake(ctx context.Context, req model.HttpRequest, base *url.URL, sioPath string, headers http.Header) (sid string, pingInterval, pingTimeout time.Duration, errHS *model.SocketIOHandshake, err error) {
	u := cloneURL(base)
	if u.Scheme == "ws" {
		u.Scheme = "http"
	} else if u.Scheme == "wss" {
		u.Scheme = "https"
	}
	u.Path = strings.TrimRight(u.Path, "/") + "/" + strings.Trim(sioPath, "/") + "/"
	q := u.Query()
	q.Set("EIO", "3")
	q.Set("transport", "polling")
	u.RawQuery = q.Encode()
	applyQueryParams(u, req)

	transport := sharedHTTPTransport(req)
	client := &http.Client{Transport: buildHTTPRoundTripper(req, transport)}
	if t := websocketHandshakeTimeout(req); t > 0 {
		client.Timeout = t
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
	if err != nil {
		return "", 0, 0, nil, err
	}
	for k, vals := range headers {
		for _, v := range vals {
			httpReq.Header.Add(k, v)
		}
	}
	var pollJar *trackedCookieJar
	if !req.DisableCookieJar {
		pollJar = m.jars.jar(req.WorkspaceID)
	}
	if pollJar != nil {
		if cookieURL := socketIOCookieURL(base); cookieURL != nil {
			for _, cookie := range pollJar.Cookies(cookieURL) {
				httpReq.AddCookie(cookie)
			}
		}
	}

	buildHS := func(resp *http.Response) *model.SocketIOHandshake {
		hs := &model.SocketIOHandshake{URL: socketIODisplayURL(u), Method: "GET", RequestHeaders: headersToList(httpReq.Header)}
		if resp != nil {
			hs.StatusCode = resp.StatusCode
			hs.StatusText = resp.Status
			hs.ResponseHeaders = headersToList(resp.Header)
		}
		return hs
	}

	resp, err := client.Do(httpReq)
	if err != nil {
		return "", 0, 0, nil, err
	}
	defer resp.Body.Close()
	if pollJar != nil {
		if cookieURL := socketIOCookieURL(base); cookieURL != nil {
			pollJar.SetCookies(cookieURL, resp.Cookies())
		}
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, 8192))
	if err != nil {
		return "", 0, 0, buildHS(resp), err
	}

	if resp.StatusCode >= 400 {
		return "", 0, 0, buildHS(resp), fmt.Errorf("HTTP %s", resp.Status)
	}

	openJSON := eioParseFirstOpenPacket(string(body))
	if openJSON == "" {
		return "", 0, 0, buildHS(resp), fmt.Errorf("no OPEN packet in polling response (status %s)", resp.Status)
	}
	var openData eioOpenData
	if err := json.Unmarshal([]byte(openJSON), &openData); err != nil {
		return "", 0, 0, buildHS(resp), fmt.Errorf("invalid OPEN packet JSON: %w", err)
	}
	pingInterval = time.Duration(openData.PingInterval) * time.Millisecond
	pingTimeout = time.Duration(openData.PingTimeout) * time.Millisecond
	if pingInterval <= 0 {
		pingInterval = 25 * time.Second
	}
	if pingTimeout <= 0 {
		pingTimeout = 20 * time.Second
	}
	if openData.SID == "" {
		return "", 0, 0, buildHS(resp), fmt.Errorf("empty session id in OPEN packet")
	}
	return openData.SID, pingInterval, pingTimeout, nil, nil
}

func eioParseFirstOpenPacket(body string) string {
	for len(body) > 0 {
		colonIdx := strings.IndexByte(body, ':')
		if colonIdx < 0 {
			break
		}
		n := 0
		for _, c := range body[:colonIdx] {
			if c < '0' || c > '9' {
				return ""
			}
			n = n*10 + int(c-'0')
		}
		rest := body[colonIdx+1:]
		if n > len(rest) {
			break
		}
		packet := rest[:n]
		if len(packet) > 0 && packet[0] == '0' {
			return packet[1:]
		}
		body = rest[n:]
	}
	return ""
}

func buildSocketIOBaseURL(rawURL string) (*url.URL, error) {
	raw := strings.TrimSpace(rawURL)
	if raw == "" {
		return nil, fmt.Errorf("empty URL")
	}
	if isBarePortLikeURL(raw) {
		return nil, fmt.Errorf("%s", invalidBarePortURLMessage("http"))
	}
	switch {
	case strings.HasPrefix(raw, "ws://"):
		raw = "http://" + raw[5:]
	case strings.HasPrefix(raw, "wss://"):
		raw = "https://" + raw[6:]
	case !strings.Contains(raw, "://"):
		raw = "http://" + raw
	}
	u, err := url.Parse(raw)
	if err != nil {
		return nil, fmt.Errorf("invalid URL: %w", err)
	}
	if u.Host == "" {
		return nil, fmt.Errorf("invalid URL: missing host")
	}
	if isNumericHostname(u.Hostname()) {
		return nil, fmt.Errorf("%s", invalidBarePortURLMessage("http"))
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		u.Scheme = "http"
	}
	return u, nil
}

func socketIOPollingURL(base *url.URL, sioPath string) *url.URL {
	u := cloneURL(base)
	switch u.Scheme {
	case "ws":
		u.Scheme = "http"
	case "wss":
		u.Scheme = "https"
	}
	u.Path = strings.TrimRight(u.Path, "/") + "/" + strings.Trim(sioPath, "/") + "/"
	return u
}

func buildSocketIOWSURL(base *url.URL, sioPath, eioVer, sid string) *url.URL {
	u := cloneURL(base)
	switch u.Scheme {
	case "http":
		u.Scheme = "ws"
	case "https":
		u.Scheme = "wss"
	}
	u.Path = strings.TrimRight(u.Path, "/") + "/" + strings.Trim(sioPath, "/") + "/"
	q := url.Values{}
	q.Set("EIO", eioVer)
	q.Set("transport", "websocket")
	if sid != "" {
		q.Set("sid", sid)
	}
	u.RawQuery = q.Encode()
	return u
}

func socketIODisplayURL(u *url.URL) string {
	if u == nil {
		return ""
	}
	c := cloneURL(u)
	switch c.Scheme {
	case "ws":
		c.Scheme = "http"
	case "wss":
		c.Scheme = "https"
	}
	rawQuery := c.RawQuery
	c.RawQuery = ""
	if rawQuery == "" {
		return c.String()
	}
	return c.String() + "?" + decodeQueryForDisplay(rawQuery)
}

func socketIOConnectionError(err error, target *url.URL, timeout time.Duration) string {
	if err == nil {
		return ""
	}
	if target == nil {
		return strings.TrimPrefix(strings.TrimSpace(err.Error()), "Error: ")
	}
	requestTarget := cloneURL(target)
	switch requestTarget.Scheme {
	case "ws":
		requestTarget.Scheme = "http"
	case "wss":
		requestTarget.Scheme = "https"
	}
	return strings.TrimPrefix(formatRequestError(err, requestTarget, timeout), "Error: ")
}

func decodeQueryForDisplay(raw string) string {
	if raw == "" {
		return ""
	}
	parts := strings.Split(raw, "&")
	for i, part := range parts {
		key, value, hasValue := strings.Cut(part, "=")
		if decoded, err := url.QueryUnescape(key); err == nil {
			key = decoded
		}
		if hasValue {
			if decoded, err := url.QueryUnescape(value); err == nil {
				value = decoded
			}
			parts[i] = key + "=" + value
		} else {
			parts[i] = key
		}
	}
	return strings.Join(parts, "&")
}

func socketIOCookieURL(u *url.URL) *url.URL {
	if u == nil {
		return nil
	}
	c := cloneURL(u)
	switch c.Scheme {
	case "ws":
		c.Scheme = "http"
	case "wss":
		c.Scheme = "https"
	case "http", "https":
	default:
		return nil
	}
	return c
}

func sioConnectPacket(namespace string) string {
	if namespace == "/" {
		return string(eioMessage) + string(sioConnect)
	}
	return string(eioMessage) + string(sioConnect) + namespace + ","
}

func parseSIONamespace(data []byte) (string, []byte) {
	if len(data) == 0 || data[0] != '/' {
		return "/", data
	}
	for i, b := range data {
		if b == ',' {
			return string(data[:i]), data[i+1:]
		}
	}
	return string(data), nil
}

func parseSIOEvent(data []byte) (eventName string, args []string) {

	i := 0
	for i < len(data) && data[i] >= '0' && data[i] <= '9' {
		i++
	}
	data = data[i:]

	var arr []json.RawMessage
	if err := json.Unmarshal(data, &arr); err != nil || len(arr) == 0 {
		return string(data), nil
	}
	if err := json.Unmarshal(arr[0], &eventName); err != nil {
		eventName = string(arr[0])
	}
	args = make([]string, len(arr)-1)
	for i, raw := range arr[1:] {
		args[i] = string(raw)
	}
	return eventName, args
}

func parseSIOAck(data []byte) (ackID int, args []string) {
	i := 0
	for i < len(data) && data[i] >= '0' && data[i] <= '9' {
		ackID = ackID*10 + int(data[i]-'0')
		i++
	}
	data = data[i:]
	var arr []json.RawMessage
	if err := json.Unmarshal(data, &arr); err != nil {
		return ackID, nil
	}
	args = make([]string, len(arr))
	for i, raw := range arr {
		args[i] = string(raw)
	}
	return ackID, args
}

func parseSIOConnectError(data []byte) string {
	if len(data) == 0 {
		return "unknown error"
	}
	var obj struct {
		Message string `json:"message"`
	}
	if err := json.Unmarshal(data, &obj); err == nil && obj.Message != "" {
		return obj.Message
	}
	var s string
	if err := json.Unmarshal(data, &s); err == nil {
		return s
	}
	return string(data)
}

func headersToList(h http.Header) []map[string]string {
	out := make([]map[string]string, 0, len(h))
	for k, vals := range h {
		for _, v := range vals {
			out = append(out, map[string]string{"key": k, "value": v})
		}
	}
	return out
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}
