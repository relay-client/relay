package api

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/gorilla/websocket"
	"github.com/relay-client/relay/apps/desktop/internal/model"
)

// ---------- SSE ----------

func TestSSEBrowserEmulationSendsBrowserHeaders(t *testing.T) {
	var gotOrigin, gotFetchMode, gotFetchSite, gotUA string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotOrigin = r.Header.Get("Origin")
		gotFetchMode = r.Header.Get("Sec-Fetch-Mode")
		gotFetchSite = r.Header.Get("Sec-Fetch-Site")
		gotUA = r.Header.Get("User-Agent")
		w.Header().Set("Content-Type", "text/event-stream")
		w.WriteHeader(http.StatusOK)
		fmt.Fprint(w, ":\n\n")
		w.(http.Flusher).Flush()
	}))
	defer srv.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 1*time.Second)
	defer cancel()

	em := &testEmitter{}
	runStreamWithEmitter(ctx, model.HttpRequest{
		URL:                   srv.URL,
		BrowserEmulation:      true,
		BrowserOrigin:         "https://app.example.com",
		EnableSSLVerification: true,
	}, em)

	if gotOrigin != "https://app.example.com" {
		t.Fatalf("expected Origin from browser settings, got %q", gotOrigin)
	}
	if gotFetchMode != "cors" || gotFetchSite != "cross-site" {
		t.Fatalf("expected cors/cross-site fetch metadata, got mode=%q site=%q", gotFetchMode, gotFetchSite)
	}
	if !strings.HasPrefix(gotUA, "Mozilla/5.0 ") {
		t.Fatalf("expected browser UA on SSE, got %q", gotUA)
	}
}

func TestSSECORSEnforceBlocksWhenAllowOriginMissing(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 1*time.Second)
	defer cancel()

	em := &testEmitter{}
	runStreamWithEmitter(ctx, model.HttpRequest{
		URL:                   srv.URL,
		BrowserOrigin:         "https://app.example.com",
		BrowserEnforceCORS:    true,
		EnableSSLVerification: true,
	}, em)

	if len(em.errors) == 0 {
		t.Fatal("expected CORS error on SSE without ACAO")
	}
	if !strings.Contains(em.errors[0].Message, "CORS error: response is missing Access-Control-Allow-Origin") {
		t.Fatalf("expected CORS missing-ACAO error, got %q", em.errors[0].Message)
	}
}

func TestSSECSPBlocksBeforeNetwork(t *testing.T) {
	var hits atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits.Add(1)
		w.Header().Set("Content-Type", "text/event-stream")
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 1*time.Second)
	defer cancel()

	em := &testEmitter{}
	runStreamWithEmitter(ctx, model.HttpRequest{
		URL:                   srv.URL,
		BrowserOrigin:         "https://app.example.com",
		BrowserEnforceCSP:     true,
		BrowserCSP:            "connect-src 'self'",
		EnableSSLVerification: true,
	}, em)

	if len(em.errors) == 0 || !strings.Contains(em.errors[0].Message, "CSP error") {
		t.Fatalf("expected CSP error, got errors=%+v", em.errors)
	}
	if hits.Load() != 0 {
		t.Fatalf("expected CSP to block before network, got %d hits", hits.Load())
	}
}

func TestSSEStripsCookieOnCrossOriginWithoutCredentials(t *testing.T) {
	var gotCookie string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotCookie = r.Header.Get("Cookie")
		w.Header().Set("Content-Type", "text/event-stream")
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 1*time.Second)
	defer cancel()

	em := &testEmitter{}
	runStreamWithEmitter(ctx, model.HttpRequest{
		URL:              srv.URL,
		BrowserEmulation: true,
		BrowserOrigin:    "https://app.example.com",
		Headers: []model.KeyValue{
			{Enabled: true, Key: "Cookie", Value: "session=secret"},
		},
		EnableSSLVerification: true,
	}, em)

	if gotCookie != "" {
		t.Fatalf("expected cross-origin SSE without credentials to omit Cookie, got %q", gotCookie)
	}
}

// ---------- WebSocket ----------

func TestWebSocketBrowserEmulationSetsOrigin(t *testing.T) {
	upgrader := websocket.Upgrader{CheckOrigin: func(*http.Request) bool { return true }}
	gotOrigin := make(chan string, 1)
	gotUA := make(chan string, 1)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		select {
		case gotOrigin <- r.Header.Get("Origin"):
		default:
		}
		select {
		case gotUA <- r.Header.Get("User-Agent"):
		default:
		}
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}
		defer conn.Close()
		_ = conn.WriteMessage(websocket.TextMessage, []byte("ok"))
		time.Sleep(10 * time.Millisecond)
	}))
	defer server.Close()

	mgr := newWebSocketManager(nil)
	em := newWSTestEmitter()
	mgr.connectWithCallbacks(context.Background(), "ws-emu", model.HttpRequest{
		URL:                   wsURLFromHTTP(server.URL),
		BrowserEmulation:      true,
		BrowserOrigin:         "https://app.example.com",
		EnableSSLVerification: true,
		TimeoutMs:             2000,
	}, em.callbacks())
	defer mgr.disconnect("ws-emu")

	waitWSOpen(t, em.opens)

	select {
	case got := <-gotOrigin:
		if got != "https://app.example.com" {
			t.Fatalf("expected Origin in WS handshake, got %q", got)
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for handshake origin")
	}
	select {
	case got := <-gotUA:
		if !strings.HasPrefix(got, "Mozilla/5.0 ") {
			t.Fatalf("expected browser UA, got %q", got)
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for UA")
	}
}

func TestWebSocketCSPBlocksBeforeHandshake(t *testing.T) {
	var hits atomic.Int32
	upgrader := websocket.Upgrader{CheckOrigin: func(*http.Request) bool { return true }}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits.Add(1)
		_, _ = upgrader.Upgrade(w, r, nil)
	}))
	defer server.Close()

	mgr := newWebSocketManager(nil)
	em := newWSTestEmitter()
	mgr.connectWithCallbacks(context.Background(), "ws-csp", model.HttpRequest{
		URL:                   wsURLFromHTTP(server.URL),
		BrowserOrigin:         "https://app.example.com",
		BrowserEnforceCSP:     true,
		BrowserCSP:            "connect-src 'self'",
		EnableSSLVerification: true,
		TimeoutMs:             2000,
	}, em.callbacks())
	defer mgr.disconnect("ws-csp")

	gotErr := waitWSError(t, em.errors)
	if !strings.Contains(gotErr.Message, "CSP error") {
		t.Fatalf("expected CSP error, got %q", gotErr.Message)
	}
	if hits.Load() != 0 {
		t.Fatalf("WS handshake must not run when CSP blocks, got %d hits", hits.Load())
	}
}

func TestWebSocketCSPSelfAllowsHttpsToWss(t *testing.T) {
	upgrader := websocket.Upgrader{CheckOrigin: func(*http.Request) bool { return true }}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}
		defer conn.Close()
		_ = conn.WriteMessage(websocket.TextMessage, []byte("ok"))
		time.Sleep(10 * time.Millisecond)
	}))
	defer server.Close()

	u, _ := url.Parse(server.URL)

	mgr := newWebSocketManager(nil)
	em := newWSTestEmitter()
	// Protected origin uses scheme of server.URL, target uses ws://. 'self' should match by upgrade rule.
	mgr.connectWithCallbacks(context.Background(), "ws-self", model.HttpRequest{
		URL:                   wsURLFromHTTP(server.URL),
		BrowserOrigin:         "http://" + u.Host,
		BrowserEnforceCSP:     true,
		BrowserCSP:            "connect-src 'self'",
		EnableSSLVerification: true,
		TimeoutMs:             2000,
	}, em.callbacks())
	defer mgr.disconnect("ws-self")

	open := waitWSOpen(t, em.opens)
	if open.Status == "" {
		t.Fatalf("expected WS to open, got empty open event: %+v", open)
	}
}

func TestWebSocketStripsCookieOnCrossOriginWithoutCredentials(t *testing.T) {
	upgrader := websocket.Upgrader{CheckOrigin: func(*http.Request) bool { return true }}
	gotCookie := make(chan string, 1)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		select {
		case gotCookie <- r.Header.Get("Cookie"):
		default:
		}
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}
		defer conn.Close()
		_ = conn.WriteMessage(websocket.TextMessage, []byte("ok"))
		time.Sleep(10 * time.Millisecond)
	}))
	defer server.Close()

	mgr := newWebSocketManager(nil)
	em := newWSTestEmitter()
	mgr.connectWithCallbacks(context.Background(), "ws-cookie", model.HttpRequest{
		URL:              wsURLFromHTTP(server.URL),
		BrowserEmulation: true,
		BrowserOrigin:    "https://app.example.com",
		Headers: []model.KeyValue{
			{Enabled: true, Key: "Cookie", Value: "session=secret"},
		},
		EnableSSLVerification: true,
		TimeoutMs:             2000,
	}, em.callbacks())
	defer mgr.disconnect("ws-cookie")

	waitWSOpen(t, em.opens)

	select {
	case got := <-gotCookie:
		if got != "" {
			t.Fatalf("expected cross-origin WS without credentials to omit Cookie, got %q", got)
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for cookie")
	}
}

func TestWebSocketSameHostKeepsCookieWithoutCredentials(t *testing.T) {
	upgrader := websocket.Upgrader{CheckOrigin: func(*http.Request) bool { return true }}
	gotCookie := make(chan string, 1)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		select {
		case gotCookie <- r.Header.Get("Cookie"):
		default:
		}
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}
		defer conn.Close()
		_ = conn.WriteMessage(websocket.TextMessage, []byte("ok"))
		time.Sleep(10 * time.Millisecond)
	}))
	defer server.Close()

	u, _ := url.Parse(server.URL)
	// Origin uses the http(s) scheme of the same host the ws:// target points at.
	// http://host -> ws://host is a scheme upgrade, so it is same-site (cookies kept).
	mgr := newWebSocketManager(nil)
	em := newWSTestEmitter()
	mgr.connectWithCallbacks(context.Background(), "ws-samehost", model.HttpRequest{
		URL:              wsURLFromHTTP(server.URL),
		BrowserEmulation: true,
		BrowserOrigin:    "http://" + u.Host,
		Headers: []model.KeyValue{
			{Enabled: true, Key: "Cookie", Value: "session=secret"},
		},
		EnableSSLVerification: true,
		TimeoutMs:             2000,
	}, em.callbacks())
	defer mgr.disconnect("ws-samehost")

	waitWSOpen(t, em.opens)

	select {
	case got := <-gotCookie:
		if !strings.Contains(got, "session=secret") {
			t.Fatalf("expected same-host WS to keep Cookie even without credentials, got %q", got)
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for cookie")
	}
}

func TestWebSocketKeepsCookieWithCredentials(t *testing.T) {
	upgrader := websocket.Upgrader{CheckOrigin: func(*http.Request) bool { return true }}
	gotCookie := make(chan string, 1)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		select {
		case gotCookie <- r.Header.Get("Cookie"):
		default:
		}
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}
		defer conn.Close()
		_ = conn.WriteMessage(websocket.TextMessage, []byte("ok"))
		time.Sleep(10 * time.Millisecond)
	}))
	defer server.Close()

	mgr := newWebSocketManager(nil)
	em := newWSTestEmitter()
	mgr.connectWithCallbacks(context.Background(), "ws-credentialed", model.HttpRequest{
		URL:                    wsURLFromHTTP(server.URL),
		BrowserEmulation:       true,
		BrowserOrigin:          "https://app.example.com",
		BrowserWithCredentials: true,
		Headers: []model.KeyValue{
			{Enabled: true, Key: "Cookie", Value: "session=secret"},
		},
		EnableSSLVerification: true,
		TimeoutMs:             2000,
	}, em.callbacks())
	defer mgr.disconnect("ws-credentialed")

	waitWSOpen(t, em.opens)

	select {
	case got := <-gotCookie:
		if !strings.Contains(got, "session=secret") {
			t.Fatalf("expected Cookie preserved with credentials, got %q", got)
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for cookie")
	}
}

// ---------- Socket.IO ----------

func TestSocketIOSetsBrowserOriginOnHandshake(t *testing.T) {
	upgrader := websocket.Upgrader{CheckOrigin: func(*http.Request) bool { return true }}
	gotOrigin := make(chan string, 1)
	gotUA := make(chan string, 1)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		select {
		case gotOrigin <- r.Header.Get("Origin"):
		default:
		}
		select {
		case gotUA <- r.Header.Get("User-Agent"):
		default:
		}
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}
		defer conn.Close()
		// Server-side: send Engine.IO OPEN packet to satisfy client expectations.
		_ = conn.WriteMessage(websocket.TextMessage, []byte(`0{"sid":"abc","upgrades":[],"pingInterval":25000,"pingTimeout":20000}`))
		time.Sleep(50 * time.Millisecond)
	}))
	defer server.Close()

	mgr := newSocketIOManager(nil)
	em := newSIOTestEmitter()
	mgr.connectWithCallbacks(context.Background(), "sio-emu", model.HttpRequest{
		URL:                   wsURLFromHTTP(server.URL),
		BrowserEmulation:      true,
		BrowserOrigin:         "https://app.example.com",
		EnableSSLVerification: true,
		TimeoutMs:             2000,
		SocketIOClientVersion: "v3",
	}, em.callbacks())
	defer mgr.disconnect("sio-emu")

	select {
	case got := <-gotOrigin:
		if got != "https://app.example.com" {
			t.Fatalf("expected Origin in Socket.IO handshake, got %q", got)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for handshake origin")
	}
	select {
	case got := <-gotUA:
		if !strings.HasPrefix(got, "Mozilla/5.0 ") {
			t.Fatalf("expected browser UA, got %q", got)
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for UA")
	}
	mgr.disconnect("sio-emu")
}

func TestSocketIOV2PollingStripsCookieJarOnCrossOriginWithoutCredentials(t *testing.T) {
	gotCookie := make(chan string, 1)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Query().Get("transport") == "polling" {
			select {
			case gotCookie <- r.Header.Get("Cookie"):
			default:
			}
			open := `0{"sid":"poll-sid","pingInterval":25000,"pingTimeout":5000}`
			fmt.Fprintf(w, "%d:%s", len(open), open)
			return
		}
		w.WriteHeader(http.StatusBadRequest)
	}))
	defer server.Close()

	baseURL, err := url.Parse(server.URL)
	if err != nil {
		t.Fatalf("parse server URL: %v", err)
	}
	jar := newTrackedCookieJar()
	jar.SetCookies(baseURL, []*http.Cookie{{Name: "client", Value: "abc", Path: "/"}})

	mgr := newSocketIOManager(singleJarRegistry(jar))
	em := newSIOTestEmitter()
	mgr.connectWithCallbacks(context.Background(), "sio-v2-cookie", model.HttpRequest{
		URL:                   wsURLFromHTTP(server.URL),
		BrowserEmulation:      true,
		BrowserOrigin:         "https://app.example.com",
		EnableSSLVerification: true,
		TimeoutMs:             2000,
		SocketIOClientVersion: "v2",
		Headers: []model.KeyValue{
			{Enabled: true, Key: "Cookie", Value: "manual=secret"},
		},
	}, em.callbacks())
	defer mgr.disconnect("sio-v2-cookie")

	select {
	case got := <-gotCookie:
		if got != "" {
			t.Fatalf("expected cross-origin Socket.IO v2 polling without credentials to omit Cookie, got %q", got)
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for polling cookie")
	}
}

func TestSocketIOCSPBlocksBeforeHandshake(t *testing.T) {
	var hits atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits.Add(1)
	}))
	defer server.Close()

	mgr := newSocketIOManager(nil)
	em := newSIOTestEmitter()
	mgr.connectWithCallbacks(context.Background(), "sio-csp", model.HttpRequest{
		URL:                   wsURLFromHTTP(server.URL),
		BrowserOrigin:         "https://app.example.com",
		BrowserEnforceCSP:     true,
		BrowserCSP:            "connect-src 'self'",
		EnableSSLVerification: true,
		TimeoutMs:             2000,
		SocketIOClientVersion: "v3",
	}, em.callbacks())
	defer mgr.disconnect("sio-csp")

	gotErr := waitSIOError(t, em.errors)
	if !strings.Contains(gotErr.Message, "CSP error") {
		t.Fatalf("expected CSP error, got %q", gotErr.Message)
	}
	if hits.Load() != 0 {
		t.Fatalf("Socket.IO handshake must not run when CSP blocks, got %d hits", hits.Load())
	}
}
