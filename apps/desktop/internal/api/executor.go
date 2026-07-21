package api

import (
	"bytes"
	"context"
	"crypto/tls"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/relay-client/relay/apps/desktop/internal/api/auth"
	"github.com/relay-client/relay/apps/desktop/internal/api/state"
	"github.com/relay-client/relay/apps/desktop/internal/model"
	"github.com/relay-client/relay/apps/desktop/internal/script"
	"github.com/relay-client/relay/apps/desktop/internal/util"
)

const maxFileBodySize = 256 * 1024 * 1024

var maxResponseBodySize int64 = 100 * 1024 * 1024

type responseBodySink struct {
	writer io.Writer
	commit func() error
	abort  func()
}

type responseBodySinkFactory func(headers []model.KeyValue) *responseBodySink

func sendRequest(requestCtx context.Context, req model.HttpRequest, sm *state.Manager, jars *cookieJarRegistry, cache *preflightCache) model.HttpResponse {
	return sendRequestWithBodySink(requestCtx, req, sm, jars, cache, nil)
}

func sendRequestWithBodySink(requestCtx context.Context, req model.HttpRequest, sm *state.Manager, jars *cookieJarRegistry, cache *preflightCache, sinkFactory responseBodySinkFactory) model.HttpResponse {
	// Resolve the per-workspace jar up front so cookies set by Set-Cookie on
	// this response (and read by the next request in the same workspace)
	// stay scoped to req.WorkspaceID. Empty WorkspaceID falls through to
	// the default jar.
	var jar http.CookieJar
	if jars != nil {
		jar = jars.jar(req.WorkspaceID)
	}
	scope := beginScriptScope(sm, req.CollectionVariables)
	ctx := scope.ctx
	populateScriptRequestContext(ctx, req)

	var preResult model.ScriptResult
	if req.PreRequestScript != "" {
		preResult = script.RunPreRequest(req.ScriptEngine, req.PreRequestScript, ctx)
		preResult = redactScriptResult(preResult, req.SecretEnvironmentValues)
		mergeScriptURL(ctx, &req)
		mergeScriptHeaders(ctx, &req)
		mergeScriptParams(ctx, &req)
		scope.commit(sm)
		if preResult.Error != "" {
			return model.HttpResponse{
				Error:            "pre-request script failed: " + preResult.Error,
				PreRequestResult: preResult,
			}
		}
	}

	resp := doRequestWithBodySink(requestCtx, req, jar, cache, sinkFactory)
	resp.PreRequestResult = preResult

	if req.TestScript != "" {
		testScope := beginScriptScope(sm, req.CollectionVariables)
		testCtx := testScope.ctx
		testCtx.Response = &resp
		populateScriptRequestContext(testCtx, req)
		resp.TestResult = script.RunTests(req.ScriptEngine, req.TestScript, testCtx)
		resp.TestResult = redactScriptResult(resp.TestResult, req.SecretEnvironmentValues)
		testScope.commit(sm)
	}

	return resp
}

// scriptStateScope captures the variable/environment snapshot a request starts
// from so script-driven changes can be merged back into shared state without a
// lost-update race against concurrent requests. ctx carries the working copy
// the script mutates; before* hold the pristine snapshot.
type scriptStateScope struct {
	ctx        *script.Context
	injected   map[string]string
	beforeVars map[string]string
	beforeEnv  map[string]string
}

// beginScriptScope snapshots shared state, injects the request's collection
// variables, and returns a scope whose ctx is handed to the script engine.
func beginScriptScope(sm *state.Manager, collectionVariables map[string]string) *scriptStateScope {
	vars, env := sm.Snapshot()
	beforeVars := util.CloneMap(vars)
	beforeEnv := util.CloneMap(env)
	injected := applyCollectionVariables(vars, collectionVariables)
	return &scriptStateScope{
		ctx:        script.NewContext(vars, env),
		injected:   injected,
		beforeVars: beforeVars,
		beforeEnv:  beforeEnv,
	}
}

// commit drops the collection variables that were only injected for the
// script's benefit, then merges the script's actual changes back into shared
// state.
func (s *scriptStateScope) commit(sm *state.Manager) {
	stripInjectedCollectionVariables(s.ctx.Variables, s.injected)
	sm.Merge(s.beforeVars, s.ctx.Variables, s.beforeEnv, s.ctx.Environment)
}

func applyCollectionVariables(vars map[string]string, collectionVariables map[string]string) map[string]string {
	injected := make(map[string]string)
	for key, value := range collectionVariables {
		if _, exists := vars[key]; !exists {
			vars[key] = value
			injected[key] = value
		}
	}
	return injected
}

func stripInjectedCollectionVariables(vars map[string]string, injected map[string]string) {
	for key, value := range injected {
		if vars[key] == value {
			delete(vars, key)
		}
	}
}

func redactScriptResult(result model.ScriptResult, secrets []string) model.ScriptResult {
	result.Error = redactSecrets(result.Error, secrets)
	for i, log := range result.Logs {
		result.Logs[i] = redactSecrets(log, secrets)
	}
	for i, test := range result.Tests {
		result.Tests[i].Error = redactSecrets(test.Error, secrets)
	}
	return result
}

func redactSecrets(text string, secrets []string) string {
	if text == "" || len(secrets) == 0 {
		return text
	}
	unique := make(map[string]struct{}, len(secrets))
	for _, secret := range secrets {
		if secret == "" {
			continue
		}
		unique[secret] = struct{}{}
	}
	ordered := make([]string, 0, len(unique))
	for secret := range unique {
		ordered = append(ordered, secret)
	}
	sort.Slice(ordered, func(i, j int) bool { return len(ordered[i]) > len(ordered[j]) })
	for _, secret := range ordered {
		text = strings.ReplaceAll(text, secret, "[secret]")
	}
	return text
}

func populateScriptRequestContext(ctx *script.Context, req model.HttpRequest) {
	ctx.RequestURL = req.URL
	ctx.RequestMethod = req.Method
	for _, h := range req.Headers {
		if h.Enabled && h.Key != "" {
			ctx.RequestHeaders[h.Key] = h.Value
		}
	}
	for _, p := range req.Params {
		if p.Enabled && p.Key != "" {
			ctx.RequestParams[p.Key] = p.Value
		}
	}
}

func doRequestWithBodySink(ctx context.Context, req model.HttpRequest, jar http.CookieJar, cache *preflightCache, sinkFactory responseBodySinkFactory) model.HttpResponse {
	start := time.Now()
	traceCtx, timings := withResponseTiming(ctx, start)

	earlyError := func(msg string) model.HttpResponse {
		finish := time.Now()
		timings.markPrepared()
		return model.HttpResponse{
			Duration: finish.Sub(start).Milliseconds(),
			Timings:  timings.snapshot(finish),
			Error:    msg,
		}
	}

	rawURL := strings.TrimSpace(req.URL)
	if isBarePortLikeURL(rawURL) {
		return earlyError(invalidBarePortURLMessage("http"))
	}
	req.URL = normalizeRequestURL(req.URL)
	if strings.Contains(req.URL, "{{") {
		return earlyError("URL contains an unresolved variable — make sure all {{variables}} are defined in the active environment")
	}
	u, err := url.Parse(req.URL)
	if err != nil {
		return earlyError(fmt.Sprintf("invalid URL: %s", err))
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return earlyError(fmt.Sprintf("unsupported URL scheme %q. Use http:// or https://.", u.Scheme))
	}
	if u.Host == "" {
		return earlyError("invalid URL: missing host. Try http://localhost:3005/...")
	}
	if isNumericHostname(u.Hostname()) {
		return earlyError(invalidBarePortURLMessage("http"))
	}

	applyQueryParams(u, req)

	bodyReader, contentType, cleanupBody, bodyErr := buildRequestBody(req)
	if bodyErr != nil {
		return earlyError(bodyErr.Error())
	}
	if cleanupBody != nil {
		defer cleanupBody()
	}

	httpReq, err := http.NewRequestWithContext(traceCtx, req.Method, u.String(), bodyReader)
	if err != nil {
		return earlyError(fmt.Sprintf("failed to build request: %s", err))
	}

	if contentType != "" {
		httpReq.Header.Set("Content-Type", contentType)
	}
	if browserSecurityActive(req) {
		httpReq.Header.Set("User-Agent", browserLikeUserAgent)
	} else {
		httpReq.Header.Set("User-Agent", "Relay/"+appVersion)
	}
	applyUserHeaders(httpReq.Header, req.Headers)
	explicitCookieHeader := httpReq.Header.Get("Cookie") != ""

	if err := auth.Apply(httpReq, req.Auth); err != nil {
		return earlyError("auth error: " + err.Error())
	}
	browserCtx, err := prepareBrowserSecurity(req, httpReq.Header, u, browserKindFetch)
	if err != nil {
		return earlyError(err.Error())
	}
	if msg := validateBrowserCSP(req, u, browserCtx); msg != "" {
		return earlyError("CSP error: " + msg)
	}
	if browserCtx.active && browserCtx.crossOrigin && !browserCtx.withCredentials {
		req.DisableCookieJar = true
		httpReq.Header.Del("Cookie")
	}

	effectiveTimeout := effectiveRequestTimeout(req)
	requestJar := jar
	if explicitCookieHeader && !req.DisableCookieJar {
		requestJar = receiveOnlyCookieJar{jar: jar}
	}
	client := buildHTTPClient(req, requestJar, effectiveTimeout, browserCtx)
	timings.markPrepared()
	if browserCtx.enforceCORS && corsPreflightRequired(httpReq) {
		requestHeaders := corsUnsafeRequestHeaderNames(httpReq.Header)
		cacheKey := preflightCacheKey(browserCtx.origin, urlWithoutFragment(u), browserCtx.withCredentials)
		cached, ok := cache.lookup(cacheKey)
		if !ok || !preflightCacheCovers(cached, httpReq.Method, requestHeaders, browserCtx) {
			preflightResp, corsMsg, networkErr := runCORSPreflight(traceCtx, client, httpReq, u, browserCtx)
			if networkErr != nil {
				finish := time.Now()
				return model.HttpResponse{
					Duration: finish.Sub(start).Milliseconds(),
					Timings:  timings.snapshot(finish),
					Error:    formatRequestError(fmt.Errorf("CORS preflight failed: %w", networkErr), u, effectiveTimeout),
				}
			}
			if corsMsg != "" {
				finish := time.Now()
				resp := model.HttpResponse{
					Duration: finish.Sub(start).Milliseconds(),
					Timings:  timings.snapshot(finish),
					Error:    "CORS error: " + corsMsg,
				}
				if preflightResp != nil {
					resp.StatusCode = preflightResp.StatusCode
					resp.Status = preflightResp.Status
					resp.Headers = httpHeadersToKeyValues(preflightResp.Header)
				}
				return resp
			}
			if preflightResp != nil {
				cachePreflightResponse(cache, cacheKey, preflightResp)
			}
		}
	}
	httpResp, err := client.Do(httpReq)
	if err != nil {
		finish := time.Now()
		return model.HttpResponse{
			Duration: finish.Sub(start).Milliseconds(),
			Timings:  timings.snapshot(finish),
			Error:    formatRequestError(err, u, effectiveTimeout),
		}
	}
	defer httpResp.Body.Close()

	respHeaders := httpHeadersToKeyValues(httpResp.Header)
	if browserCtx.enforceCORS {
		if msg := validateCORSActualResponse(httpResp, browserCtx); msg != "" {
			finish := time.Now()
			return model.HttpResponse{
				StatusCode: httpResp.StatusCode,
				Status:     httpResp.Status,
				Headers:    respHeaders,
				Duration:   finish.Sub(start).Milliseconds(),
				Timings:    timings.snapshot(finish),
				Error:      "CORS error: " + msg,
			}
		}
	}

	if isEventStreamResponse(httpResp.Header) {
		finish := time.Now()
		return model.HttpResponse{
			StatusCode: httpResp.StatusCode,
			Status:     httpResp.Status,
			Headers:    respHeaders,
			Duration:   finish.Sub(start).Milliseconds(),
			Timings:    timings.snapshot(finish),
			Error:      "This endpoint returned an SSE stream. Switch to SSE mode to subscribe.",
		}
	}

	var (
		bodyBytes      []byte
		bodySize       int64
		truncated      bool
		readErr        error
		streamedToSink bool
	)
	if sinkFactory != nil {
		if sink := sinkFactory(respHeaders); sink != nil && sink.writer != nil {
			streamedToSink = true
			committed := false
			if sink.abort != nil {
				defer func() {
					if !committed {
						sink.abort()
					}
				}()
			}
			var preview bytes.Buffer
			bodySize, truncated, readErr = copyResponseBody(&preview, sink.writer, httpResp.Body, maxResponseBodySize)
			bodyBytes = preview.Bytes()
			if readErr == nil && sink.commit != nil {
				readErr = sink.commit()
			}
			committed = readErr == nil
		}
	}
	if !streamedToSink {
		bodyBytes, truncated, readErr = readResponseBodyWithLimit(httpResp.Body, maxResponseBodySize)
		bodySize = int64(len(bodyBytes))
		// Decompress gzip/deflate/br/zstd so the viewer shows readable text
		// instead of raw compressed bytes. A truncated body is a partial
		// compressed stream that cannot be decoded, so leave it as-is.
		if readErr == nil && !truncated {
			if decoded, ok := decodeResponseBody(bodyBytes, httpResp); ok {
				bodyBytes = decoded
				bodySize = int64(len(bodyBytes))
			}
		}
	}
	finish := time.Now()
	duration := finish.Sub(start).Milliseconds()

	resp := model.HttpResponse{
		StatusCode: httpResp.StatusCode,
		Status:     httpResp.Status,
		Headers:    respHeaders,
		Body:       string(bodyBytes),
		Duration:   duration,
		Timings:    timings.snapshot(finish),
		Size:       bodySize,
	}
	switch {
	case readErr != nil:
		if streamedToSink {
			resp.Error = fmt.Sprintf("failed to save response body: %s", readErr)
		} else {
			resp.Error = fmt.Sprintf("failed to read response body: %s", readErr)
		}
	case truncated:
		shown := maxResponseBodySize / (1024 * 1024)
		if streamedToSink {
			total := bodySize / (1024 * 1024)
			resp.Error = fmt.Sprintf("response truncated — showing %d MB of %d MB", shown, total)
		} else if httpResp.ContentLength > 0 {
			// Report the true total when the server declared it; the shown body is
			// still capped at maxResponseBodySize.
			resp.Size = httpResp.ContentLength
			total := httpResp.ContentLength / (1024 * 1024)
			resp.Error = fmt.Sprintf("response truncated — showing %d MB of %d MB", shown, total)
		} else {
			resp.Error = fmt.Sprintf("response truncated — showing first %d MB (total size unknown)", shown)
		}
	}
	return resp
}

func readResponseBodyWithLimit(body io.Reader, maxSize int64) ([]byte, bool, error) {
	bodyBytes, readErr := io.ReadAll(io.LimitReader(body, maxSize+1))
	if int64(len(bodyBytes)) <= maxSize {
		return bodyBytes, false, readErr
	}
	return bodyBytes[:int(maxSize)], true, readErr
}

func copyResponseBody(preview io.Writer, full io.Writer, body io.Reader, maxPreview int64) (size int64, truncated bool, err error) {
	buffer := make([]byte, 32*1024)
	var previewSize int64
	for {
		read, readErr := body.Read(buffer)
		if read > 0 {
			chunk := buffer[:read]
			size += int64(read)
			if full != nil {
				written, writeErr := full.Write(chunk)
				if writeErr != nil {
					return size, size > maxPreview, writeErr
				}
				if written != len(chunk) {
					return size, size > maxPreview, io.ErrShortWrite
				}
			}
			if preview != nil && previewSize < maxPreview {
				previewChunk := chunk
				if remaining := maxPreview - previewSize; int64(len(previewChunk)) > remaining {
					previewChunk = previewChunk[:remaining]
				}
				written, writeErr := preview.Write(previewChunk)
				if writeErr != nil {
					return size, size > maxPreview, writeErr
				}
				if written != len(previewChunk) {
					return size, size > maxPreview, io.ErrShortWrite
				}
				previewSize += int64(written)
			}
		}
		if readErr != nil {
			if errors.Is(readErr, io.EOF) {
				return size, size > maxPreview, nil
			}
			return size, size > maxPreview, readErr
		}
	}
}

func isEventStreamResponse(headers http.Header) bool {
	contentType := strings.ToLower(headers.Get("Content-Type"))
	return strings.Contains(contentType, "text/event-stream")
}

func buildRequestBody(req model.HttpRequest) (io.Reader, string, func(), error) {
	switch req.BodyType {
	case "json":
		if req.Body != "" {
			return strings.NewReader(req.Body), "application/json", nil, nil
		}
	case "text":
		if req.Body != "" {
			return strings.NewReader(req.Body), "text/plain", nil, nil
		}
	case "javascript":
		if req.Body != "" {
			return strings.NewReader(req.Body), "application/javascript", nil, nil
		}
	case "xml":
		if req.Body != "" {
			return strings.NewReader(req.Body), "application/xml", nil, nil
		}
	case "html":
		if req.Body != "" {
			return strings.NewReader(req.Body), "text/html", nil, nil
		}
	case "graphql":
		if req.Body != "" {
			return strings.NewReader(req.Body), "application/json", nil, nil
		}
	case "urlencoded":
		form := url.Values{}
		for _, kv := range req.FormData {
			if kv.Enabled && kv.Key != "" {
				form.Add(kv.Key, kv.Value)
			}
		}
		return strings.NewReader(form.Encode()), "application/x-www-form-urlencoded", nil, nil
	case "form":
		body, ct, err := buildMultipartBody(req.FormData)
		if err != nil {
			return nil, "", nil, err
		}
		var cleanup func()
		if pr, ok := body.(*io.PipeReader); ok {
			cleanup = func() { _ = pr.Close() }
		}
		return body, ct, cleanup, nil
	case "binary":
		if req.BodyFilePath != "" {
			fi, err := os.Stat(req.BodyFilePath)
			if err != nil {
				return nil, "", nil, fmt.Errorf("failed to access file: %w", err)
			}
			if fi.IsDir() {
				return nil, "", nil, fmt.Errorf("failed to read file: %s is a directory", req.BodyFilePath)
			}
			if fi.Size() > maxFileBodySize {
				return nil, "", nil, fmt.Errorf("file too large (%.0f MB) — binary body limit is 256 MB", float64(fi.Size())/(1024*1024))
			}
			file, err := os.Open(req.BodyFilePath)
			if err != nil {
				return nil, "", nil, fmt.Errorf("failed to read file: %w", err)
			}
			return file, "application/octet-stream", func() { _ = file.Close() }, nil
		}
	}
	return nil, "", nil, nil
}

func buildMultipartBody(fields []model.KeyValue) (io.Reader, string, error) {
	for _, kv := range fields {
		if !kv.Enabled || kv.Key == "" {
			continue
		}
		if kv.IsFile && kv.Value != "" {
			fi, err := os.Stat(kv.Value)
			if err != nil {
				return nil, "", fmt.Errorf("failed to read form file: %w", err)
			}
			if fi.IsDir() {
				return nil, "", fmt.Errorf("failed to read form file: %s is a directory", kv.Value)
			}
			if fi.Size() > maxFileBodySize {
				return nil, "", fmt.Errorf("form file too large (%.0f MB) — multipart file limit is 256 MB", float64(fi.Size())/(1024*1024))
			}
		}
	}

	pr, pw := io.Pipe()
	mw := multipart.NewWriter(pw)
	go func() {
		var err error
		defer func() {
			if err != nil {
				_ = pw.CloseWithError(err)
				return
			}
			_ = pw.Close()
		}()

		for _, kv := range fields {
			if !kv.Enabled || kv.Key == "" {
				continue
			}
			if kv.IsFile && kv.Value != "" {
				var file *os.File
				file, err = os.Open(kv.Value)
				if err != nil {
					err = fmt.Errorf("failed to read form file: %w", err)
					return
				}
				var fw io.Writer
				fw, err = mw.CreateFormFile(kv.Key, filepath.Base(kv.Value))
				if err != nil {
					_ = file.Close()
					err = fmt.Errorf("failed to create multipart file field: %w", err)
					return
				}
				if _, err = io.Copy(fw, file); err != nil {
					_ = file.Close()
					err = fmt.Errorf("failed to write multipart file field: %w", err)
					return
				}
				if closeErr := file.Close(); closeErr != nil {
					err = fmt.Errorf("failed to close form file: %w", closeErr)
					return
				}
			} else if err = mw.WriteField(kv.Key, kv.Value); err != nil {
				err = fmt.Errorf("failed to write multipart field: %w", err)
				return
			}
		}
		if err = mw.Close(); err != nil {
			err = fmt.Errorf("failed to finalize multipart body: %w", err)
		}
	}()
	return pr, mw.FormDataContentType(), nil
}

func effectiveRequestTimeout(req model.HttpRequest) time.Duration {
	if req.TimeoutMs > 0 {
		return time.Duration(req.TimeoutMs) * time.Millisecond
	}
	return 30 * time.Second
}

func buildHTTPClient(req model.HttpRequest, jar http.CookieJar, timeout time.Duration, browserCtx browserSecurityContext) *http.Client {
	maxRedirects := req.MaxRedirects
	if maxRedirects <= 0 {
		maxRedirects = 10
	}

	transport := buildBaseHTTPTransport(req)
	roundTripper := buildHTTPRoundTripper(req, transport)

	if req.DisableCookieJar {
		jar = nil
	}

	return &http.Client{
		Timeout:       timeout,
		Transport:     roundTripper,
		Jar:           jar,
		CheckRedirect: buildRedirectPolicy(req, maxRedirects, browserCtx),
	}
}

func buildBaseHTTPTransport(req model.HttpRequest) *http.Transport {
	baseTransport, _ := http.DefaultTransport.(*http.Transport)
	if baseTransport == nil {
		baseTransport = &http.Transport{}
	}
	transport := baseTransport.Clone()
	transport.ForceAttemptHTTP2 = req.HTTPVersion != "1.1"
	if req.HTTPVersion == "1.1" {
		transport.TLSNextProto = map[string]func(string, *tls.Conn) http.RoundTripper{}
	}
	// Always pin a minimum TLS version. Even when the user opts out of
	// certificate verification (a debugging affordance), accepting TLS 1.0/1.1
	// would expose them to known protocol attacks they didn't ask for.
	if !req.EnableSSLVerification {
		transport.TLSClientConfig = &tls.Config{InsecureSkipVerify: true, MinVersion: tls.VersionTLS12}
	} else if transport.TLSClientConfig == nil {
		transport.TLSClientConfig = &tls.Config{MinVersion: tls.VersionTLS12}
	} else if transport.TLSClientConfig.MinVersion < tls.VersionTLS12 {
		transport.TLSClientConfig = transport.TLSClientConfig.Clone()
		transport.TLSClientConfig.MinVersion = tls.VersionTLS12
	}
	transport.Proxy = proxyForRequest(req)
	return transport
}

func buildHTTPRoundTripper(req model.HttpRequest, transport *http.Transport) http.RoundTripper {
	var roundTripper http.RoundTripper = transport
	if req.Auth.Type == "digest" && req.Auth.Username != "" {
		roundTripper = auth.NewDigestTransport(req.Auth.Username, req.Auth.Password, transport)
	}
	return roundTripper
}

func buildRedirectPolicy(req model.HttpRequest, maxRedirects int, browserCtx browserSecurityContext) func(*http.Request, []*http.Request) error {
	return func(next *http.Request, via []*http.Request) error {
		if !req.FollowRedirects {
			return http.ErrUseLastResponse
		}
		if len(via) >= maxRedirects {
			return http.ErrUseLastResponse
		}
		prev := via[len(via)-1]
		if req.FollowOriginalMethod {
			next.Method = prev.Method
			if prev.GetBody != nil {
				if bodyCopy, err := prev.GetBody(); err == nil {
					next.Body = bodyCopy
					next.GetBody = prev.GetBody
					next.ContentLength = prev.ContentLength
				}
			} else if prev.Body != nil && prev.Body != http.NoBody {
				return fmt.Errorf("cannot replay request body through redirect: body is not reusable")
			}
		}
		// Follow the standard library behavior: drop Authorization when
		// the redirect crosses hosts. This protects bearer/basic tokens
		// from leaking to a third-party server that an attacker could
		// reach via a malicious 302. The FollowAuthorizationHeader flag
		// only re-attaches credentials when the destination host (and
		// scheme) match the previous hop — Postman/Insomnia behave the
		// same way for the same reason.
		if req.FollowAuthorizationHeader {
			if authorization := prev.Header.Get("Authorization"); authorization != "" {
				if sameHostAndScheme(prev.URL, next.URL) {
					next.Header.Set("Authorization", authorization)
				} else {
					next.Header.Del("Authorization")
				}
			}
		} else {
			next.Header.Del("Authorization")
		}
		if req.RemoveRefererHeader {
			next.Header.Del("Referer")
		}
		if browserCtx.active && browserCtx.origin != "" {
			nextOrigin := &url.URL{Scheme: next.URL.Scheme, Host: next.URL.Host}
			if browserCtx.originURL != nil && sameOrigin(browserCtx.originURL, nextOrigin) {
				next.Header.Set("Sec-Fetch-Site", "same-origin")
			} else {
				next.Header.Set("Sec-Fetch-Site", "cross-site")
			}
			// Re-validate CSP connect-src against the redirect target.
			// Without this the user-facing guarantee "browser-mode would
			// have blocked this" is bypassed by a single 302.
			if msg := validateBrowserCSP(req, next.URL, browserCtx); msg != "" {
				return errors.New(msg)
			}
		}
		return nil
	}
}

// sameHostAndScheme reports whether two URLs share scheme and host (port
// included). Used to decide whether Authorization may be propagated through a
// redirect.
func sameHostAndScheme(a, b *url.URL) bool {
	if a == nil || b == nil {
		return false
	}
	return strings.EqualFold(a.Scheme, b.Scheme) && strings.EqualFold(a.Host, b.Host)
}

func applyQueryParams(u *url.URL, req model.HttpRequest) {
	if req.EncodeURLAutomatically {
		q := u.Query()
		for _, p := range req.Params {
			if p.Enabled && p.Key != "" {
				q.Add(p.Key, p.Value)
			}
		}
		if req.Auth.Type == "apikey" && req.Auth.KeyIn == "query" && req.Auth.KeyName != "" {
			q.Add(req.Auth.KeyName, req.Auth.KeyValue)
		}
		u.RawQuery = q.Encode()
	} else {
		raw := u.RawQuery
		for _, p := range req.Params {
			if p.Enabled && p.Key != "" {
				raw = appendRawQuery(raw, p.Key, p.Value)
			}
		}
		if req.Auth.Type == "apikey" && req.Auth.KeyIn == "query" && req.Auth.KeyName != "" {
			raw = appendRawQuery(raw, req.Auth.KeyName, req.Auth.KeyValue)
		}
		u.RawQuery = raw
	}
}

// applyUserHeaders copies enabled rows onto the outgoing request. Hop-by-hop
// and framing-controlling headers (Transfer-Encoding, Content-Length,
// Connection, Upgrade, Proxy-*) are dropped: letting the user override these
// can enable HTTP request smuggling through downstream proxies and breaks the
// net/http transport's own framing assumptions. The user-visible URL/body
// fields still control the body length, as expected.
func applyUserHeaders(headers http.Header, rows []model.KeyValue) {
	seen := make(map[string]struct{}, len(rows))
	for _, h := range rows {
		if !h.Enabled || h.Key == "" {
			continue
		}
		if isReservedFramingHeader(h.Key) {
			continue
		}
		key := http.CanonicalHeaderKey(h.Key)
		normalized := strings.ToLower(key)
		if _, ok := seen[normalized]; !ok {
			headers.Del(key)
			seen[normalized] = struct{}{}
		}
		headers.Add(key, h.Value)
	}
}

func isReservedFramingHeader(name string) bool {
	switch strings.ToLower(strings.TrimSpace(name)) {
	case "transfer-encoding", "content-length", "connection", "upgrade",
		"keep-alive", "proxy-authenticate", "proxy-authorization", "te",
		"trailer", "host":
		return true
	}
	return false
}

func normalizeRequestURL(raw string) string {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" || strings.HasPrefix(trimmed, "{{") {
		return trimmed
	}
	if strings.HasPrefix(trimmed, "//") {
		return "http:" + trimmed
	}
	if !strings.Contains(trimmed, "://") {
		return "http://" + trimmed
	}
	return trimmed
}

func isBarePortLikeURL(raw string) bool {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" || strings.HasPrefix(trimmed, "{{") || strings.HasPrefix(trimmed, "//") || strings.Contains(trimmed, "://") {
		return false
	}
	host := trimmed
	for _, sep := range []string{"/", "?", "#"} {
		if before, _, found := strings.Cut(host, sep); found {
			host = before
		}
	}
	if host == "" {
		return false
	}
	return isNumericHostname(host)
}

func isNumericHostname(host string) bool {
	if host == "" {
		return false
	}
	for _, ch := range host {
		if ch < '0' || ch > '9' {
			return false
		}
	}
	return true
}

func invalidBarePortURLMessage(scheme string) string {
	return fmt.Sprintf("invalid URL: enter a host. If this is a port, use %s://localhost:<port>.", scheme)
}

func formatRequestError(err error, target *url.URL, timeout time.Duration) string {
	if errors.Is(err, context.Canceled) {
		return "Request canceled"
	}
	var urlErr *url.Error
	if errors.Is(err, context.DeadlineExceeded) || errors.As(err, &urlErr) && urlErr.Timeout() {
		return fmt.Sprintf("Error: request timed out after %d ms", timeout.Milliseconds())
	}

	lower := strings.ToLower(err.Error())
	targetAddr := requestErrorAddress(target)
	switch {
	case strings.Contains(lower, "connection refused"):
		return "Error: connect ECONNREFUSED " + targetAddr
	case strings.Contains(lower, "connection reset"):
		return "Error: read ECONNRESET " + targetAddr
	case strings.Contains(lower, "no route to host"), strings.Contains(lower, "ehostunreach"):
		return "Error: connect EHOSTUNREACH " + targetAddr
	case strings.Contains(lower, "network is unreachable"), strings.Contains(lower, "enetunreach"):
		return "Error: connect ENETUNREACH " + targetAddr
	case strings.Contains(lower, "i/o timeout"), strings.Contains(lower, "timeout awaiting response headers"), strings.Contains(lower, "tls handshake timeout"):
		return "Error: connect ETIMEDOUT " + targetAddr
	case strings.Contains(lower, "no such host"):
		return "Error: getaddrinfo ENOTFOUND " + target.Hostname()
	}

	message := strings.TrimSpace(err.Error())
	if strings.HasPrefix(message, "Error: ") {
		return message
	}
	return "Error: " + message
}

func requestErrorAddress(target *url.URL) string {
	host := target.Hostname()
	if strings.EqualFold(host, "localhost") {
		host = "127.0.0.1"
	}
	port := target.Port()
	if port == "" {
		if target.Scheme == "https" {
			port = "443"
		} else {
			port = "80"
		}
	}
	return net.JoinHostPort(host, port)
}

func urlWithoutFragment(u *url.URL) string {
	if u == nil {
		return ""
	}
	noFrag := *u
	noFrag.Fragment = ""
	noFrag.RawFragment = ""
	return noFrag.String()
}

func appendRawQuery(rawQuery, key, value string) string {
	pair := url.QueryEscape(key) + "=" + url.QueryEscape(value)
	if rawQuery == "" {
		return pair
	}
	return rawQuery + "&" + pair
}

func mergeScriptURL(ctx *script.Context, req *model.HttpRequest) {
	if ctx.RequestURL != "" && ctx.RequestURL != req.URL {
		req.URL = ctx.RequestURL
	}
}

func mergeScriptHeaders(ctx *script.Context, req *model.HttpRequest) {
	if len(ctx.RemovedHeaders) > 0 {
		next := req.Headers[:0]
		for _, h := range req.Headers {
			if _, removed := ctx.RemovedHeaders[strings.ToLower(h.Key)]; removed {
				continue
			}
			next = append(next, h)
		}
		req.Headers = next
	}
	for k, v := range ctx.RequestHeaders {
		merged := false
		for i, h := range req.Headers {
			if strings.EqualFold(h.Key, k) {
				req.Headers[i].Value = v
				req.Headers[i].Enabled = true
				merged = true
				break
			}
		}
		if !merged {
			req.Headers = append(req.Headers, model.KeyValue{Key: k, Value: v, Enabled: true})
		}
	}
}

func mergeScriptParams(ctx *script.Context, req *model.HttpRequest) {
	if len(ctx.RemovedParams) > 0 {
		next := req.Params[:0]
		for _, p := range req.Params {
			if _, removed := ctx.RemovedParams[p.Key]; removed {
				continue
			}
			next = append(next, p)
		}
		req.Params = next
	}
	for k, v := range ctx.RequestParams {
		merged := false
		for i, p := range req.Params {
			if p.Key == k {
				req.Params[i].Value = v
				req.Params[i].Enabled = true
				merged = true
				break
			}
		}
		if !merged {
			req.Params = append(req.Params, model.KeyValue{Key: k, Value: v, Enabled: true})
		}
	}
}
