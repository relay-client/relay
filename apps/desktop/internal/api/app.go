package api

import (
	"context"
	"fmt"
	"io"
	"mime"
	"os"
	"path/filepath"
	goruntime "runtime"
	"strings"
	"sync"
	"time"

	"github.com/relay-client/relay/apps/desktop/internal/api/auth"
	"github.com/relay-client/relay/apps/desktop/internal/api/state"
	"github.com/relay-client/relay/apps/desktop/internal/model"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

var appVersion = "dev"

const maxTextFileReadSize = 100 * 1024 * 1024

type App struct {
	ctx            context.Context
	quitMu         sync.Mutex
	allowQuit      bool
	quitPending    bool
	requestMu      sync.Mutex
	requestSeq     uint64
	requestCancels map[string]requestCancel
	state          *state.Manager
	cookieJars     *cookieJarRegistry
	preflightCache *preflightCache
	sse            *sseManager
	ws             *websocketManager
	sio            *socketIOManager
}

type SaveRequestStoreResult struct {
	Ok    bool   `json:"ok"`
	Error string `json:"error,omitempty"`
}

type requestCancel struct {
	seq    uint64
	cancel context.CancelFunc
}

func NewApp() *App {
	jars := newCookieJarRegistry()
	return &App{
		requestCancels: make(map[string]requestCancel),
		state:          state.New(),
		cookieJars:     jars,
		preflightCache: newPreflightCache(),
		sse:            newSSEManager(jars),
		ws:             newWebSocketManager(jars),
		sio:            newSocketIOManager(jars),
	}
}

func (a *App) Startup(ctx context.Context) {
	a.ctx = ctx
}

func (a *App) Shutdown(_ context.Context) {
	if a.ws != nil {
		a.ws.disconnectAll()
	}
	if a.sio != nil {
		a.sio.disconnectAll()
	}
	if a.sse != nil {
		a.sse.disconnectAll()
	}
}

func (a *App) BeforeClose(ctx context.Context) bool {
	a.quitMu.Lock()
	if a.allowQuit {
		a.quitMu.Unlock()
		return false
	}
	if a.quitPending {
		a.quitMu.Unlock()
		return true
	}
	a.quitPending = true
	a.quitMu.Unlock()
	runtime.EventsEmit(ctx, "relay:before-quit")
	return true
}

func (a *App) AppInfo() model.AppInfo {
	return model.AppInfo{
		Name:      "Relay",
		Version:   appVersion,
		Runtime:   goruntime.GOOS + "/" + goruntime.GOARCH,
		GoVersion: goruntime.Version(),
	}
}

func (a *App) Show() {
	if a.ctx != nil {
		runtime.WindowShow(a.ctx)
	}
}

func (a *App) emitWorkspaceChanged(reason string) {
	if a.ctx == nil {
		return
	}
	runtime.EventsEmit(a.ctx, "relay:workspace-changed", reason)
}

func (a *App) Hide() {
	if a.ctx != nil {
		runtime.WindowHide(a.ctx)
	}
}

func (a *App) Quit() {
	if a.ctx != nil {
		runtime.Quit(a.ctx)
	}
}

func (a *App) ConfirmQuit() {
	if a.ctx == nil {
		return
	}
	a.quitMu.Lock()
	a.allowQuit = true
	a.quitPending = false
	a.quitMu.Unlock()
	runtime.Quit(a.ctx)
}

func (a *App) CancelQuit() {
	a.quitMu.Lock()
	a.quitPending = false
	a.quitMu.Unlock()
}

func (a *App) SetAppThemeBackground(theme string, background string) {
	resolved := normalizeResolvedTheme(theme)
	_ = saveResolvedThemePreference(resolved)
	_ = saveWindowBackgroundPreference(background)
	if a.ctx == nil {
		return
	}
	r, g, b, alpha := loadWindowBackgroundPreference(resolved)
	runtime.WindowSetBackgroundColour(a.ctx, r, g, b, alpha)
}

func (a *App) ClipboardSet(text string) {
	if a.ctx != nil {
		runtime.ClipboardSetText(a.ctx, text)
	}
}

func (a *App) ClipboardGet() string {
	if a.ctx == nil {
		return ""
	}
	text, _ := runtime.ClipboardGetText(a.ctx)
	return text
}

func (a *App) OpenFileDialog(title string) string {
	if a.ctx == nil {
		return ""
	}
	path, err := runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{Title: title})
	if err != nil {
		return ""
	}
	return path
}

func (a *App) ReadTextFile(path string) string {
	if path == "" {
		return ""
	}
	fi, err := os.Stat(path)
	if err != nil || fi.IsDir() || fi.Size() > maxTextFileReadSize {
		return ""
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return ""
	}
	return string(data)
}

func (a *App) SaveFileDialog(defaultName string, content string) string {
	if a.ctx == nil {
		return ""
	}
	path, err := runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{
		DefaultFilename: defaultName,
		Title:           "Save file",
	})
	if err != nil || path == "" {
		return ""
	}
	if err := os.WriteFile(path, []byte(content), 0600); err != nil {
		return ""
	}
	return path
}

func (a *App) LoadRequestStore() string {
	gitOperationMu.RLock()
	defer gitOperationMu.RUnlock()
	payload, _, err := loadRelayStorePayloadWithDiagnostics(requestStorePath(), fileWorkspaceStorePath())
	if err != nil {
		return ""
	}
	return payload
}

func (a *App) LoadWorkspaceDiagnostics() []WorkspaceDiagnostic {
	gitOperationMu.RLock()
	defer gitOperationMu.RUnlock()
	_, diagnostics, _ := loadRelayStorePayloadWithDiagnostics(requestStorePath(), fileWorkspaceStorePath())
	if diagnostics == nil {
		return []WorkspaceDiagnostic{}
	}
	return diagnostics
}

func (a *App) SaveRequestStore(payload string) bool {
	return a.SaveRequestStoreWithError(payload).Ok
}

func (a *App) SaveRequestStoreWithError(payload string) SaveRequestStoreResult {
	gitOperationMu.Lock()
	defer gitOperationMu.Unlock()
	if err := a.saveRequestStorePayload(payload); err != nil {
		return SaveRequestStoreResult{Ok: false, Error: err.Error()}
	}
	return SaveRequestStoreResult{Ok: true}
}

func (a *App) saveRequestStorePayload(payload string) error {
	root := fileWorkspaceStorePath()
	localStoreAuthFailed := false
	if _, _, err := loadLocalRequestStore(requestStorePath()); err != nil && isRequestStoreAuthenticationError(err) {
		localStoreAuthFailed = true
	}
	if hasYAMLWorkspaceStore(root) {
		if localStoreAuthFailed {
			if _, backupErr := backupRequestStoreForRecovery(requestStorePath()); backupErr != nil {
				return fmt.Errorf("request store could not be decrypted and backup failed: %w", backupErr)
			}
			return saveRelayStorePayloadPreserving(requestStorePath(), root, payload, nil)
		}
		_, diagnostics, err := loadRelayStorePayloadWithDiagnostics(requestStorePath(), root)
		if err != nil {
			if isRequestStoreAuthenticationError(err) {
				if _, backupErr := backupRequestStoreForRecovery(requestStorePath()); backupErr != nil {
					return fmt.Errorf("request store could not be decrypted and backup failed: %w", backupErr)
				}
				return saveRelayStorePayloadPreserving(requestStorePath(), root, payload, nil)
			}
			return err
		}
		return saveRelayStorePayloadPreserving(requestStorePath(), root, payload, diagnosticPreserveDirs(root, diagnostics))
	}
	return saveRelayStorePayload(requestStorePath(), root, payload)
}

func (a *App) GetVariables() map[string]string         { return a.state.GetVariables() }
func (a *App) GetEnvironment() map[string]string       { return a.state.GetEnvironment() }
func (a *App) SetVariable(key, value string)           { a.state.SetVariable(key, value) }
func (a *App) SetEnvironmentVar(key, value string)     { a.state.SetEnvironmentVar(key, value) }
func (a *App) SetEnvironment(values map[string]string) { a.state.SetEnvironment(values) }
func (a *App) DeleteVariable(key string)               { a.state.DeleteVariable(key) }
func (a *App) ClearVariables()                         { a.state.ClearVariables() }

func (a *App) FetchOAuth2Token(cfg model.AuthConfig) model.OAuth2TokenResponse {
	return auth.FetchToken(cfg)
}

func (a *App) AuthorizeOAuth2(cfg model.AuthConfig) model.OAuth2TokenResponse {
	ctx := a.ctx
	if ctx == nil {
		ctx = context.Background()
	}
	return auth.AuthorizeCode(ctx, cfg, func(target string) error {
		if a.ctx != nil {
			runtime.BrowserOpenURL(a.ctx, target)
		}
		return nil
	})
}

func (a *App) RefreshOAuth2Token(cfg model.AuthConfig) model.OAuth2TokenResponse {
	return auth.RefreshToken(cfg)
}

// ListCookies returns the cookie jar entries scoped to a workspace. An empty
// workspaceID refers to the default jar (used by callers without workspace
// context). The frontend should always pass the active workspace ID so the
// UI cookie inspector matches what the backend actually attaches to requests.
func (a *App) ListCookies(workspaceID string) []model.Cookie {
	return a.cookieJars.jar(workspaceID).ListCookies()
}

func (a *App) UpsertCookie(workspaceID string, cookie model.Cookie) model.CookieJarResult {
	cookies, err := a.cookieJars.jar(workspaceID).UpsertCookie(cookie)
	result := model.CookieJarResult{Cookies: cookies}
	if err != nil {
		result.Error = err.Error()
	}
	return result
}

func (a *App) DeleteCookie(workspaceID string, cookie model.Cookie) model.CookieJarResult {
	return model.CookieJarResult{Cookies: a.cookieJars.jar(workspaceID).DeleteCookie(cookie)}
}

func (a *App) ClearCookies(workspaceID string) []model.Cookie {
	return a.cookieJars.jar(workspaceID).ClearCookies()
}

func isDevBuild() bool {
	v := strings.TrimSpace(appVersion)
	return v == "" || v == "dev"
}

func (a *App) CheckForUpdate() model.UpdateCheckResult {
	if isDevBuild() {
		return model.UpdateCheckResult{}
	}
	ctx, cancel := context.WithTimeout(updateBaseContext(a.ctx), updateMetadataTimeout)
	defer cancel()
	info, err := checkForUpdate(ctx)
	if err != nil {
		return model.UpdateCheckResult{Error: friendlyUpdateError(err, "check for updates")}
	}
	if !semverIsNewer(info.Version, appVersion) {
		return model.UpdateCheckResult{}
	}
	return model.UpdateCheckResult{Info: info}
}

// ApplyUpdate ignores the UpdateInfo received from the frontend except for the
// version (used to confirm the user is opting into the same release they were
// shown). The DownloadURL, SHA256 and SignatureURL are re-fetched from the
// trusted manifest on the Go side so a JS-bridge caller (or an XSS in the
// WebView) can't redirect the updater at an attacker-controlled URL.
func (a *App) ApplyUpdate(info model.UpdateInfo) string {
	if isDevBuild() {
		return "Updates are disabled in development builds. Install a release build to receive updates."
	}
	ctx, cancel := context.WithTimeout(updateBaseContext(a.ctx), updateDownloadTimeout)
	defer cancel()
	trusted, err := resolveTrustedUpdateInfo(ctx)
	if err != nil {
		return friendlyUpdateError(err, "install the update")
	}
	// If the caller asked to install a specific version, only proceed when
	// the trusted manifest still advertises that version (or newer). This
	// protects against a race where the manifest changed between Check and
	// Apply, but does not let the caller force a stale/older binary.
	if requested := strings.TrimSpace(strings.TrimPrefix(info.Version, "v")); requested != "" {
		if requested != trusted.Version && !semverIsNewer(trusted.Version, requested) {
			return friendlyUpdateError(errUpdateVersionRollback, "install the update")
		}
	}
	if err := downloadAndApply(ctx, trusted); err != nil {
		return friendlyUpdateError(err, "install the update")
	}
	return ""
}

func updateBaseContext(ctx context.Context) context.Context {
	if ctx != nil {
		return ctx
	}
	return context.Background()
}

func (a *App) RestartApp() {
	relaunchSelf()
}

func (a *App) SendRequest(req model.HttpRequest) model.HttpResponse {
	baseCtx := context.Background()
	if a.ctx != nil {
		baseCtx = a.ctx
	}
	ctx, cancel := context.WithCancel(baseCtx)
	seq := a.registerRequestCancel(req.RequestID, cancel)
	defer func() {
		cancel()
		a.unregisterRequestCancel(req.RequestID, seq)
	}()
	return sendRequest(ctx, req, a.state, a.cookieJars, a.preflightCache)
}

// DownloadResult carries the response (for normal display/history) plus the path the body was
// written to, if the user picked one.
type DownloadResult struct {
	Response  model.HttpResponse `json:"response"`
	SavedPath string             `json:"savedPath"`
}

func newResponseDownloadSink(path string, onCommit func()) (*responseBodySink, error) {
	dir := filepath.Dir(path)
	tmp, err := os.CreateTemp(dir, ".relay-download-*.tmp")
	if err != nil {
		return nil, err
	}
	tmpPath := tmp.Name()
	closed := false
	closeFile := func() error {
		if closed {
			return nil
		}
		closed = true
		return tmp.Close()
	}
	return &responseBodySink{
		writer: tmp,
		commit: func() error {
			if err := tmp.Sync(); err != nil {
				_ = closeFile()
				return err
			}
			if err := closeFile(); err != nil {
				return err
			}
			if err := os.Rename(tmpPath, path); err != nil {
				return err
			}
			if err := syncDir(dir); err != nil {
				return err
			}
			if onCommit != nil {
				onCommit()
			}
			return nil
		},
		abort: func() {
			_ = closeFile()
			_ = os.Remove(tmpPath)
		},
	}, nil
}

// SendRequestToFile streams the full raw response into a temporary file while keeping only the
// bounded viewer preview in resp.Body. Once the network request and scripts have finished, it asks
// the user where to save and atomically copies the staged bytes into that destination.
func (a *App) SendRequestToFile(req model.HttpRequest, defaultName string) DownloadResult {
	baseCtx := context.Background()
	if a.ctx != nil {
		baseCtx = a.ctx
	}
	ctx, cancel := context.WithCancel(baseCtx)
	seq := a.registerRequestCancel(req.RequestID, cancel)
	defer func() {
		cancel()
		a.unregisterRequestCancel(req.RequestID, seq)
	}()
	stagedPath := ""
	stagedReady := false
	var stageErr error
	resp := sendRequestWithBodySink(ctx, req, a.state, a.cookieJars, a.preflightCache, func([]model.KeyValue) *responseBodySink {
		if a.ctx == nil {
			return nil
		}
		tmp, err := os.CreateTemp("", "relay-download-*")
		if err != nil {
			stageErr = err
			return nil
		}
		stagedPath = tmp.Name()
		closed := false
		closeFile := func() error {
			if closed {
				return nil
			}
			closed = true
			return tmp.Close()
		}
		return &responseBodySink{
			writer: tmp,
			commit: func() error {
				if err := tmp.Sync(); err != nil {
					_ = closeFile()
					return err
				}
				if err := closeFile(); err != nil {
					return err
				}
				stagedReady = true
				return nil
			},
			abort: func() {
				_ = closeFile()
				_ = os.Remove(stagedPath)
			},
		}
	})
	if stagedPath != "" {
		defer os.Remove(stagedPath)
	}
	if stageErr != nil {
		resp.Error = "failed to stage response body: " + stageErr.Error()
		return DownloadResult{Response: resp}
	}
	if !stagedReady || a.ctx == nil || resp.StatusCode == 0 {
		return DownloadResult{Response: resp}
	}
	path, err := runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{
		DefaultFilename: downloadFilename(defaultName, resp.Headers),
		Title:           "Save response",
	})
	if err != nil || path == "" {
		return DownloadResult{Response: resp}
	}
	source, err := os.Open(stagedPath)
	if err != nil {
		resp.Error = "failed to save response body: " + err.Error()
		return DownloadResult{Response: resp}
	}
	defer source.Close()
	sink, err := newResponseDownloadSink(path, nil)
	if err != nil {
		resp.Error = "failed to save response body: " + err.Error()
		return DownloadResult{Response: resp}
	}
	if _, err := io.Copy(sink.writer, source); err != nil {
		sink.abort()
		resp.Error = "failed to save response body: " + err.Error()
		return DownloadResult{Response: resp}
	}
	if err := sink.commit(); err != nil {
		sink.abort()
		resp.Error = "failed to save response body: " + err.Error()
		return DownloadResult{Response: resp}
	}
	return DownloadResult{Response: resp, SavedPath: path}
}

// downloadFilename picks a save name: the server's Content-Disposition filename if present,
// otherwise the caller's default with an extension inferred from Content-Type when it lacks one.
func downloadFilename(defaultName string, headers []model.KeyValue) string {
	for _, h := range headers {
		if !strings.EqualFold(h.Key, "Content-Disposition") {
			continue
		}
		if _, params, err := mime.ParseMediaType(h.Value); err == nil {
			if fn := strings.TrimSpace(params["filename"]); fn != "" {
				return filepath.Base(fn)
			}
		}
	}
	name := strings.TrimSpace(defaultName)
	if name == "" {
		name = "response"
	}
	if filepath.Ext(name) == "" {
		if ext := extensionForContentType(contentTypeHeader(headers)); ext != "" {
			name += ext
		}
	}
	return name
}

func contentTypeHeader(headers []model.KeyValue) string {
	for _, h := range headers {
		if strings.EqualFold(h.Key, "Content-Type") {
			return h.Value
		}
	}
	return ""
}

func extensionForContentType(contentType string) string {
	mediaType, _, err := mime.ParseMediaType(contentType)
	if err != nil {
		return ""
	}
	switch mediaType {
	case "application/json":
		return ".json"
	case "text/html":
		return ".html"
	case "application/xml", "text/xml":
		return ".xml"
	case "text/plain":
		return ".txt"
	case "text/csv":
		return ".csv"
	case "application/pdf":
		return ".pdf"
	case "image/png":
		return ".png"
	case "image/jpeg":
		return ".jpg"
	case "image/gif":
		return ".gif"
	case "image/webp":
		return ".webp"
	case "image/svg+xml":
		return ".svg"
	case "application/zip":
		return ".zip"
	case "application/octet-stream":
		return ".bin"
	}
	if exts, _ := mime.ExtensionsByType(mediaType); len(exts) > 0 {
		return exts[0]
	}
	return ""
}

func (a *App) SendGrpcRequest(req model.GrpcRequest) model.GrpcResponse {
	baseCtx := context.Background()
	if a.ctx != nil {
		baseCtx = a.ctx
	}
	ctx, cancel := context.WithCancel(baseCtx)
	seq := a.registerRequestCancel(req.RequestID, cancel)
	defer func() {
		cancel()
		a.unregisterRequestCancel(req.RequestID, seq)
	}()
	return sendGrpcRequest(ctx, req, a.state, a.grpcEventEmitter())
}

func (a *App) grpcEventEmitter() grpcEventEmitter {
	if a.ctx == nil {
		return nil
	}
	return func(eventName string, payload any) {
		runtime.EventsEmit(a.ctx, eventName, payload)
	}
}

func (a *App) GrpcDiscover(req model.GrpcRequest) model.GrpcServiceDefinition {
	baseCtx := context.Background()
	if a.ctx != nil {
		baseCtx = a.ctx
	}
	ctx := baseCtx
	if req.TimeoutMs > 0 {
		var cancel context.CancelFunc
		ctx, cancel = context.WithTimeout(baseCtx, time.Duration(req.TimeoutMs)*time.Millisecond)
		defer cancel()
	}
	return discoverGrpcServices(ctx, req)
}

func (a *App) registerRequestCancel(requestID string, cancel context.CancelFunc) uint64 {
	if requestID == "" {
		return 0
	}
	a.requestMu.Lock()
	defer a.requestMu.Unlock()
	if existing, ok := a.requestCancels[requestID]; ok {
		existing.cancel()
	}
	a.requestSeq++
	seq := a.requestSeq
	a.requestCancels[requestID] = requestCancel{seq: seq, cancel: cancel}
	return seq
}

func (a *App) unregisterRequestCancel(requestID string, seq uint64) {
	if requestID == "" {
		return
	}
	a.requestMu.Lock()
	defer a.requestMu.Unlock()
	if existing, ok := a.requestCancels[requestID]; ok && existing.seq == seq {
		delete(a.requestCancels, requestID)
	}
}

func (a *App) CancelRequest(requestID string) {
	if requestID == "" {
		return
	}
	a.requestMu.Lock()
	existing, ok := a.requestCancels[requestID]
	if ok {
		delete(a.requestCancels, requestID)
	}
	a.requestMu.Unlock()
	if ok {
		existing.cancel()
	}
}

func (a *App) SSEConnect(sessionID string, req model.HttpRequest) {
	if a.ctx == nil {
		return
	}
	a.sse.connect(a.ctx, sessionID, req)
}

func (a *App) SSEDisconnect(sessionID string) {
	a.sse.disconnect(sessionID)
}

func (a *App) WebSocketConnect(sessionID string, req model.HttpRequest) {
	if a.ctx == nil {
		return
	}
	a.ws.connect(a.ctx, sessionID, req)
}

func (a *App) WebSocketDisconnect(sessionID string) {
	a.ws.disconnect(sessionID)
}

func (a *App) WebSocketSend(sessionID string, msg model.WebSocketSendMessage) model.WebSocketSendResult {
	return a.ws.send(sessionID, msg)
}

func (a *App) SocketIOConnect(sessionID string, req model.HttpRequest) {
	if a.ctx == nil {
		return
	}
	a.sio.connect(a.ctx, sessionID, req)
}

func (a *App) SocketIODisconnect(sessionID string) {
	a.sio.disconnect(sessionID)
}

func (a *App) SocketIOEmit(sessionID string, msg model.SocketIOEmitMessage) model.SocketIOEmitResult {
	return a.sio.emit(sessionID, msg)
}
