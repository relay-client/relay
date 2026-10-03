package api

import (
	"context"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"strings"

	"github.com/relay-client/relay/apps/desktop/internal/model"
)

const browserLikeUserAgent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"

type browserSecurityContext struct {
	active          bool
	enforceCORS     bool
	enforceCSP      bool
	withCredentials bool
	origin          string
	originURL       *url.URL
	crossOrigin     bool
	corsRequested   bool
	corsTainted     bool
	crossSiteSeen   bool
	kind            browserSecurityKind
}

type browserSecurityKind int

const (
	browserKindFetch browserSecurityKind = iota
	browserKindHandshake
)

func browserSecurityActive(req model.HttpRequest) bool {
	return req.BrowserEmulation || req.BrowserEnforceCORS || req.BrowserEnforceCSP
}

func prepareBrowserSecurity(req model.HttpRequest, headers http.Header, target *url.URL, kind browserSecurityKind) (browserSecurityContext, error) {
	ctx := browserSecurityContext{
		active:          browserSecurityActive(req),
		enforceCORS:     req.BrowserEnforceCORS,
		enforceCSP:      req.BrowserEnforceCSP,
		withCredentials: req.BrowserWithCredentials,
		corsRequested:   req.BrowserEnforceCORS,
		kind:            kind,
	}
	if !ctx.active {
		return ctx, nil
	}

	origin := strings.TrimSpace(req.BrowserOrigin)
	if origin == "" {
		origin = strings.TrimSpace(headers.Get("Origin"))
	}
	if origin == "" && (ctx.enforceCORS || ctx.enforceCSP) {
		return ctx, fmt.Errorf("browser emulation requires an Origin for CORS/CSP checks")
	}
	if origin != "" {
		normalizedOrigin, originURL, err := normalizeBrowserOrigin(origin)
		if err != nil {
			return ctx, err
		}
		ctx.origin = normalizedOrigin
		ctx.originURL = originURL
		ctx.crossOrigin = originURL == nil || !browserOriginMatchesTarget(originURL, target, kind)
		ctx.corsTainted = ctx.crossOrigin
		ctx.crossSiteSeen = ctx.crossOrigin
		headers.Set("Origin", normalizedOrigin)
	}

	if kind == browserKindFetch {
		if headers.Get("Accept") == "" {
			headers.Set("Accept", "*/*")
		}
		headers.Set("Sec-Fetch-Dest", "empty")
		headers.Set("Sec-Fetch-Mode", "cors")
		if ctx.origin == "" {
			headers.Set("Sec-Fetch-Site", "none")
		} else if ctx.crossOrigin {
			headers.Set("Sec-Fetch-Site", "cross-site")
		} else {
			headers.Set("Sec-Fetch-Site", "same-origin")
		}
	}

	if !ctx.crossOrigin {
		ctx.enforceCORS = false
	}
	return ctx, nil
}

func normalizeBrowserOrigin(raw string) (string, *url.URL, error) {
	raw = strings.TrimSpace(raw)
	if strings.EqualFold(raw, "null") {
		return "null", nil, nil
	}
	if raw != "" && !strings.Contains(raw, "://") {
		if strings.HasPrefix(raw, "//") {
			raw = "http:" + raw
		} else {
			raw = "http://" + raw
		}
	}
	parsed, err := url.Parse(raw)
	if err != nil || parsed.Scheme == "" || parsed.Host == "" {
		return "", nil, fmt.Errorf("invalid browser Origin %q. Use an origin like https://app.example.com", raw)
	}
	scheme := strings.ToLower(parsed.Scheme)
	if scheme != "http" && scheme != "https" {
		return "", nil, fmt.Errorf("invalid browser Origin %q. Use http:// or https://", raw)
	}
	hostname := strings.ToLower(parsed.Hostname())
	if hostname == "" {
		return "", nil, fmt.Errorf("invalid browser Origin %q. Use an origin like https://app.example.com", raw)
	}
	port := parsed.Port()
	if port != "" && port == defaultPort(scheme) {
		port = ""
	}
	host := hostname
	if strings.Contains(hostname, ":") {
		host = "[" + hostname + "]"
	}
	if port != "" {
		host = host + ":" + port
	}
	origin := &url.URL{Scheme: scheme, Host: host}
	return origin.String(), origin, nil
}

func runCORSPreflight(ctx context.Context, client *http.Client, actualReq *http.Request, target *url.URL, browserCtx browserSecurityContext) (*http.Response, string, error) {
	preflightReq, err := http.NewRequestWithContext(ctx, http.MethodOptions, target.String(), nil)
	if err != nil {
		return nil, "", err
	}
	preflightReq.Header.Set("Origin", browserCtx.origin)
	preflightReq.Header.Set("Access-Control-Request-Method", actualReq.Method)
	requestHeaders := corsUnsafeRequestHeaderNames(actualReq.Header)
	if len(requestHeaders) > 0 {
		preflightReq.Header.Set("Access-Control-Request-Headers", strings.Join(requestHeaders, ", "))
	}
	preflightReq.Header.Set("User-Agent", actualReq.Header.Get("User-Agent"))
	preflightReq.Header.Set("Accept", "*/*")
	preflightReq.Header.Set("Sec-Fetch-Dest", "empty")
	preflightReq.Header.Set("Sec-Fetch-Mode", "cors")
	preflightReq.Header.Set("Sec-Fetch-Site", actualReq.Header.Get("Sec-Fetch-Site"))

	preflightClient := *client
	preflightClient.Jar = nil
	preflightClient.CheckRedirect = func(*http.Request, []*http.Request) error {
		return http.ErrUseLastResponse
	}

	resp, err := preflightClient.Do(preflightReq)
	if err != nil {
		return nil, "", err
	}
	defer resp.Body.Close()
	_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 4096))

	if msg := validateCORSPreflightResponse(resp, actualReq.Method, requestHeaders, browserCtx); msg != "" {
		return resp, msg, nil
	}
	return resp, "", nil
}

func corsPreflightRequired(req *http.Request) bool {
	if req == nil {
		return false
	}
	return !isSimpleCORSMethod(req.Method) || len(corsUnsafeRequestHeaderNames(req.Header)) > 0
}

func isSimpleCORSMethod(method string) bool {
	switch strings.ToUpper(method) {
	case http.MethodGet, http.MethodHead, http.MethodPost:
		return true
	default:
		return false
	}
}

func corsUnsafeRequestHeaderNames(headers http.Header) []string {
	names := make(map[string]struct{})
	var safelisted []string
	safelistValueSize := 0
	for name, values := range headers {
		lower := strings.ToLower(strings.TrimSpace(name))
		if lower == "" || isBrowserControlledCORSHeader(lower) {
			continue
		}
		for _, value := range values {
			value = strings.Trim(value, " \t\r\n")
			if !isCORSSafelistedRequestHeader(lower, value) {
				names[lower] = struct{}{}
				continue
			}
			safelisted = append(safelisted, lower)
			safelistValueSize += len(value)
		}
	}
	if safelistValueSize > corsSafelistValueSizeLimit {
		for _, name := range safelisted {
			names[name] = struct{}{}
		}
	}
	out := make([]string, 0, len(names))
	for name := range names {
		out = append(out, name)
	}
	sort.Strings(out)
	return out
}

const (
	corsSafelistValueLengthLimit = 128
	corsSafelistValueSizeLimit   = 1024
)

func isBrowserControlledCORSHeader(name string) bool {
	if strings.HasPrefix(name, "sec-") || strings.HasPrefix(name, "proxy-") {
		return true
	}
	switch name {
	case "accept-encoding", "access-control-request-headers", "access-control-request-method", "connection", "content-length", "cookie", "host", "origin", "referer", "te", "trailer", "transfer-encoding", "upgrade", "user-agent":
		return true
	default:
		return false
	}
}

func isCORSSafelistedRequestHeader(name, value string) bool {
	if len(value) > corsSafelistValueLengthLimit {
		return false
	}
	switch name {
	case "accept":
		return !containsCORSUnsafeRequestHeaderByte(value)
	case "accept-language", "content-language":
		return isCORSLanguageHeaderValue(value)
	case "content-type":
		if containsCORSUnsafeRequestHeaderByte(value) {
			return false
		}
		switch corsMIMEEssence(value) {
		case "application/x-www-form-urlencoded", "multipart/form-data", "text/plain":
			return true
		default:
			return false
		}
	case "range":
		return isCORSSimpleRangeHeaderValue(value)
	default:
		return false
	}
}

func containsCORSUnsafeRequestHeaderByte(value string) bool {
	for i := 0; i < len(value); i++ {
		b := value[i]
		if b < 0x20 && b != '\t' || b == 0x7f {
			return true
		}
		switch b {
		case '"', '(', ')', ':', '<', '>', '?', '@', '[', '\\', ']', '{', '}':
			return true
		}
	}
	return false
}

func isCORSLanguageHeaderValue(value string) bool {
	for i := 0; i < len(value); i++ {
		b := value[i]
		switch {
		case b >= '0' && b <= '9', b >= 'A' && b <= 'Z', b >= 'a' && b <= 'z':
		case b == ' ', b == '*', b == ',', b == '-', b == '.', b == ';', b == '=':
		default:
			return false
		}
	}
	return true
}

func corsMIMEEssence(value string) string {
	essence := strings.ToLower(strings.Trim(strings.Split(value, ";")[0], " \t\r\n"))
	mediaType, subtype, ok := strings.Cut(essence, "/")
	if !ok || !isHTTPToken(mediaType) || !isHTTPToken(subtype) {
		return ""
	}
	return essence
}

func isHTTPToken(value string) bool {
	if value == "" {
		return false
	}
	for i := 0; i < len(value); i++ {
		b := value[i]
		switch {
		case b >= '0' && b <= '9', b >= 'A' && b <= 'Z', b >= 'a' && b <= 'z':
		case strings.IndexByte("!#$%&'*+-.^_`|~", b) >= 0:
		default:
			return false
		}
	}
	return true
}

func isCORSSimpleRangeHeaderValue(value string) bool {
	rest, ok := strings.CutPrefix(value, "bytes=")
	if !ok {
		return false
	}
	start, end, ok := strings.Cut(rest, "-")
	if !ok || start == "" || !isASCIIDigits(start) || end != "" && !isASCIIDigits(end) {
		return false
	}
	if end == "" {
		return true
	}
	startValue, err := strconv.ParseUint(start, 10, 64)
	if err != nil {
		return false
	}
	endValue, err := strconv.ParseUint(end, 10, 64)
	return err == nil && startValue <= endValue
}

func isASCIIDigits(value string) bool {
	for i := 0; i < len(value); i++ {
		if value[i] < '0' || value[i] > '9' {
			return false
		}
	}
	return value != ""
}

func validateCORSPreflightResponse(resp *http.Response, method string, requestHeaders []string, ctx browserSecurityContext) string {
	if resp.StatusCode < 200 || resp.StatusCode > 299 {
		return fmt.Sprintf("preflight returned HTTP %d; browsers require a successful 2xx preflight response", resp.StatusCode)
	}
	if msg := validateCORSOrigin(resp.Header, ctx); msg != "" {
		return "preflight " + msg
	}
	if !isSimpleCORSMethod(method) && !corsHeaderAllowsToken(resp.Header.Get("Access-Control-Allow-Methods"), method, !ctx.withCredentials) {
		return fmt.Sprintf("preflight Access-Control-Allow-Methods does not allow %s", strings.ToUpper(method))
	}
	if len(requestHeaders) > 0 {
		allowedHeaders := resp.Header.Get("Access-Control-Allow-Headers")
		for _, header := range requestHeaders {
			if !corsHeaderAllowsToken(allowedHeaders, header, !ctx.withCredentials) {
				return fmt.Sprintf("preflight Access-Control-Allow-Headers does not allow %s", header)
			}
		}
	}
	return ""
}

func validateCORSActualResponse(resp *http.Response, ctx browserSecurityContext) string {
	return validateCORSOrigin(resp.Header, ctx)
}

func validateCORSOrigin(headers http.Header, ctx browserSecurityContext) string {
	if values := headers.Values("Access-Control-Allow-Origin"); len(values) > 1 {
		return fmt.Sprintf("response contains %d Access-Control-Allow-Origin headers; browsers require exactly one", len(values))
	}
	allowOrigin := strings.TrimSpace(headers.Get("Access-Control-Allow-Origin"))
	if allowOrigin == "" {
		return fmt.Sprintf("response is missing Access-Control-Allow-Origin for origin %s", ctx.origin)
	}
	if ctx.withCredentials && allowOrigin == "*" {
		return fmt.Sprintf("response uses Access-Control-Allow-Origin: * but credentials require the exact origin %s", ctx.origin)
	}
	if allowOrigin != "*" && allowOrigin != ctx.origin {
		return fmt.Sprintf("response allows origin %s, not %s", allowOrigin, ctx.origin)
	}
	if ctx.withCredentials && !strings.EqualFold(strings.TrimSpace(headers.Get("Access-Control-Allow-Credentials")), "true") {
		return "response is missing Access-Control-Allow-Credentials: true for a credentialed request"
	}
	return ""
}

type browserBlockedError struct {
	label string
	msg   string
}

func (e browserBlockedError) Error() string {
	return e.label + " error: " + e.msg
}

func ensureCORSPreflight(ctx context.Context, client *http.Client, actualReq *http.Request, browserCtx browserSecurityContext, cache *preflightCache) (*http.Response, string, error) {
	requestHeaders := corsUnsafeRequestHeaderNames(actualReq.Header)
	cacheKey := preflightCacheKey(browserCtx.origin, urlWithoutFragment(actualReq.URL), browserCtx.withCredentials)
	if cached, ok := cache.lookup(cacheKey); ok && preflightCacheCovers(cached, actualReq.Method, requestHeaders, browserCtx) {
		return nil, "", nil
	}
	preflightResp, corsMsg, err := runCORSPreflight(ctx, client, actualReq, actualReq.URL, browserCtx)
	if err != nil || corsMsg != "" {
		return preflightResp, corsMsg, err
	}
	if preflightResp != nil {
		cachePreflightResponse(cache, cacheKey, preflightResp)
	}
	return preflightResp, "", nil
}

func corsUnexposedResponseHeaders(headers http.Header, ctx browserSecurityContext) []string {
	if !ctx.enforceCORS {
		return nil
	}
	exposed := make(map[string]struct{})
	exposeAll := false
	for _, value := range headers.Values("Access-Control-Expose-Headers") {
		for _, part := range strings.Split(value, ",") {
			name := strings.ToLower(strings.TrimSpace(part))
			if name == "" {
				continue
			}
			if name == "*" && !ctx.withCredentials {
				exposeAll = true
			}
			exposed[name] = struct{}{}
		}
	}
	var hidden []string
	for name := range headers {
		lower := strings.ToLower(name)
		if lower == "set-cookie" || lower == "set-cookie2" {
			hidden = append(hidden, name)
			continue
		}
		if isCORSSafelistedResponseHeader(lower) || exposeAll {
			continue
		}
		if _, ok := exposed[lower]; ok {
			continue
		}
		hidden = append(hidden, name)
	}
	sort.Strings(hidden)
	return hidden
}

func isCORSSafelistedResponseHeader(name string) bool {
	switch name {
	case "cache-control", "content-language", "content-length", "content-type", "expires", "last-modified", "pragma":
		return true
	default:
		return false
	}
}

func corsHeaderAllowsToken(headerValue, token string, wildcardAllowed bool) bool {
	token = strings.ToLower(strings.TrimSpace(token))
	wildcardCoversToken := wildcardAllowed && token != "authorization"
	for _, part := range strings.Split(headerValue, ",") {
		part = strings.ToLower(strings.TrimSpace(part))
		if part == token || (part == "*" && wildcardCoversToken) {
			return true
		}
	}
	return false
}

func validateBrowserCSP(req model.HttpRequest, target *url.URL, browserCtx browserSecurityContext) string {
	if !req.BrowserEnforceCSP {
		return ""
	}
	policy := strings.TrimSpace(req.BrowserCSP)
	if policy == "" {
		return "CSP emulation requires a Content-Security-Policy value"
	}
	if browserCtx.originURL == nil {
		return "CSP emulation requires an http:// or https:// browser Origin"
	}
	sources, directive := cspSourcesForConnect(policy)
	if sources == nil {
		return ""
	}
	if cspSourcesAllow(sources, target, browserCtx.originURL) {
		return ""
	}
	return fmt.Sprintf("request to %s violates %s %s for origin %s", urlOrigin(target), directive, strings.Join(sources, " "), browserCtx.origin)
}

func cspSourcesForConnect(policy string) ([]string, string) {
	directives := parseCSPDirectives(policy)
	if sources, ok := directives["connect-src"]; ok {
		return sources, "connect-src"
	}
	if sources, ok := directives["default-src"]; ok {
		return sources, "default-src"
	}
	return nil, ""
}

func parseCSPDirectives(policy string) map[string][]string {
	directives := make(map[string][]string)
	for _, rawDirective := range strings.Split(policy, ";") {
		fields := strings.Fields(strings.TrimSpace(rawDirective))
		if len(fields) == 0 {
			continue
		}
		name := strings.ToLower(fields[0])
		if _, exists := directives[name]; exists {
			continue
		}
		directives[name] = fields[1:]
	}
	return directives
}

func cspSourcesAllow(sources []string, target, protectedOrigin *url.URL) bool {
	for _, source := range sources {
		if strings.EqualFold(strings.TrimSpace(source), "'none'") {
			return false
		}
	}
	for _, source := range sources {
		if cspSourceAllows(strings.TrimSpace(source), target, protectedOrigin) {
			return true
		}
	}
	return false
}

func cspSourceAllows(source string, target, protectedOrigin *url.URL) bool {
	if source == "" {
		return false
	}
	lower := strings.ToLower(source)
	if lower == "'none'" {
		return false
	}
	if source == "*" {
		return target.Scheme == "http" || target.Scheme == "https" || target.Scheme == "ws" || target.Scheme == "wss"
	}
	if lower == "'self'" {
		return cspSelfMatches(protectedOrigin, target)
	}
	if strings.HasPrefix(source, "'") {
		return false
	}
	if strings.HasSuffix(source, ":") && !strings.Contains(source, "://") {
		return cspSchemeMatches(strings.TrimSuffix(source, ":"), target.Scheme)
	}

	sourceScheme := protectedOrigin.Scheme
	sourceHostPort := source
	if strings.HasPrefix(source, "//") {
		source = protectedOrigin.Scheme + ":" + source
	}
	if strings.Contains(source, "://") {
		scheme, rest, ok := strings.Cut(source, "://")
		if !ok || scheme == "" || rest == "" {
			return false
		}
		sourceScheme = strings.ToLower(scheme)
		sourceHostPort = cutCSPPath(rest)
		if sourceHostPort == "" {
			return false
		}
	} else {
		sourceHostPort = cutCSPPath(sourceHostPort)
	}

	if !cspSchemeMatches(sourceScheme, target.Scheme) {
		return false
	}
	sourceHost, sourcePort := splitCSPHostPort(sourceHostPort)
	if sourceHost == "" || !cspHostMatches(sourceHost, target.Hostname()) {
		return false
	}
	if sourcePort == "*" {
		return true
	}
	targetPort := effectivePort(target)
	if sourcePort != "" {
		return targetPort == sourcePort
	}
	return targetPort == defaultPort(target.Scheme)
}

func cutCSPPath(source string) string {
	for _, sep := range []string{"/", "?", "#"} {
		if before, _, found := strings.Cut(source, sep); found {
			return before
		}
	}
	return source
}

func splitCSPHostPort(hostPort string) (string, string) {
	hostPort = strings.TrimSpace(hostPort)
	if hostPort == "" {
		return "", ""
	}
	if host, port, err := net.SplitHostPort(hostPort); err == nil {
		return strings.Trim(host, "[]"), port
	}
	if strings.HasPrefix(hostPort, "[") {
		if end := strings.Index(hostPort, "]"); end >= 0 {
			host := hostPort[1:end]
			rest := hostPort[end+1:]
			if strings.HasPrefix(rest, ":") {
				return host, rest[1:]
			}
			return host, ""
		}
	}
	if i := strings.LastIndex(hostPort, ":"); i > 0 && !strings.Contains(hostPort[:i], ":") {
		return hostPort[:i], hostPort[i+1:]
	}
	return hostPort, ""
}

func cspHostMatches(pattern, host string) bool {
	pattern = strings.ToLower(strings.Trim(pattern, "[]"))
	host = strings.ToLower(strings.Trim(host, "[]"))
	if pattern == "*" {
		return true
	}
	if strings.HasPrefix(pattern, "*.") {
		base := strings.TrimPrefix(pattern, "*.")
		if base == "" || strings.HasPrefix(base, ".") {
			return false
		}
		suffix := "." + base
		return strings.HasSuffix(host, suffix) && host != base
	}
	return pattern == host
}

func browserOriginMatchesTarget(origin, target *url.URL, kind browserSecurityKind) bool {
	if origin == nil || target == nil {
		return false
	}
	if kind == browserKindHandshake {
		return cspSelfMatches(origin, target)
	}
	return sameOrigin(origin, target)
}

func cspSelfMatches(protected, target *url.URL) bool {
	if protected == nil || target == nil {
		return false
	}
	if !strings.EqualFold(protected.Hostname(), target.Hostname()) {
		return false
	}
	if effectivePort(protected) != effectivePort(target) {
		return false
	}
	ps := strings.ToLower(protected.Scheme)
	ts := strings.ToLower(target.Scheme)
	if ps == ts {
		return true
	}
	switch ps {
	case "http":
		return ts == "https" || ts == "ws" || ts == "wss"
	case "https":
		return ts == "wss"
	}
	return false
}

func cspSchemeMatches(source, target string) bool {
	s := strings.ToLower(source)
	t := strings.ToLower(target)
	if s == t {
		return true
	}
	if s == "http" && t == "https" {
		return true
	}
	if s == "ws" && t == "wss" {
		return true
	}
	return false
}

func sameOrigin(a, b *url.URL) bool {
	if a == nil || b == nil {
		return false
	}
	return strings.EqualFold(a.Scheme, b.Scheme) &&
		strings.EqualFold(a.Hostname(), b.Hostname()) &&
		effectivePort(a) == effectivePort(b)
}

func effectivePort(u *url.URL) string {
	if u == nil {
		return ""
	}
	if port := u.Port(); port != "" {
		return port
	}
	return defaultPort(u.Scheme)
}

func defaultPort(scheme string) string {
	switch strings.ToLower(scheme) {
	case "http", "ws":
		return "80"
	case "https", "wss":
		return "443"
	default:
		return ""
	}
}

func urlOrigin(u *url.URL) string {
	if u == nil {
		return ""
	}
	origin := &url.URL{Scheme: strings.ToLower(u.Scheme), Host: strings.ToLower(u.Host)}
	return origin.String()
}

func httpHeadersToKeyValues(headers http.Header) []model.KeyValue {
	keys := make([]string, 0, len(headers))
	for k := range headers {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	out := make([]model.KeyValue, 0, len(keys))
	for _, k := range keys {
		for _, v := range headers[k] {
			out = append(out, model.KeyValue{Key: k, Value: v, Enabled: true})
		}
	}
	return out
}
