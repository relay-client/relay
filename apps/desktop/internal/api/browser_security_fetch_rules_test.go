package api

import (
	"context"
	"net/http"
	"net/http/httptest"
	"net/url"
	"slices"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/relay-client/relay/apps/desktop/internal/model"
)

func TestCORSSafelistedHeaderValueRules(t *testing.T) {
	cases := []struct {
		name   string
		header string
		value  string
		unsafe bool
	}{
		{"plain accept", "Accept", "application/json", false},
		{"accept with quote", "Accept", `text/html; q="0.9"`, true},
		{"accept with at sign", "Accept", "application/vnd.api@v2", true},
		{"accept over 128 bytes", "Accept", strings.Repeat("a", 129), true},
		{"accept at 128 bytes", "Accept", strings.Repeat("a", 128), false},
		{"content-language tag", "Content-Language", "en-US, ru", false},
		{"content-language underscore", "Content-Language", "en_US", true},
		{"accept-language weights", "Accept-Language", "ru-RU,ru;q=0.9,en;q=0.8", false},
		{"accept-language slash", "Accept-Language", "en/US", true},
		{"text/plain with charset", "Content-Type", "text/plain; charset=utf-8", false},
		{"form with quoted parameter", "Content-Type", `multipart/form-data; boundary="x"`, true},
		{"json content type", "Content-Type", "application/json", true},
		{"malformed content type", "Content-Type", "text plain", true},
		{"range open end", "Range", "bytes=100-", false},
		{"range closed", "Range", "bytes=0-99", false},
		{"range suffix", "Range", "bytes=-500", true},
		{"range multiple", "Range", "bytes=0-1,5-6", true},
		{"range reversed", "Range", "bytes=9-1", true},
		{"range unit", "Range", "items=0-1", true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			headers := http.Header{}
			headers.Set(tc.header, tc.value)
			got := corsUnsafeRequestHeaderNames(headers)
			want := []string{}
			if tc.unsafe {
				want = []string{strings.ToLower(tc.header)}
			}
			if !slices.Equal(got, want) {
				t.Fatalf("%s: %q -> unsafe names %v, want %v", tc.header, tc.value, got, want)
			}
		})
	}
}

func TestCORSSafelistedHeadersBecomeUnsafeOverCombinedLimit(t *testing.T) {
	headers := http.Header{}
	for i := 0; i < 9; i++ {
		headers.Add("Accept", strings.Repeat("a", 120))
	}
	headers.Set("Content-Language", "en")
	got := corsUnsafeRequestHeaderNames(headers)
	if !slices.Equal(got, []string{"accept", "content-language"}) {
		t.Fatalf("safelisted values over 1024 bytes in total must all need a preflight, got %v", got)
	}
}

func TestSuffixRangeHeaderTriggersPreflight(t *testing.T) {
	var optionsCount atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "https://app.example.com")
		if r.Method == http.MethodOptions {
			optionsCount.Add(1)
			w.Header().Set("Access-Control-Allow-Headers", "range")
			w.WriteHeader(http.StatusNoContent)
			return
		}
		w.WriteHeader(http.StatusPartialContent)
	}))
	defer server.Close()

	req := defaultBrowserReq(server.URL)
	req.BrowserOrigin = "https://app.example.com"
	req.BrowserEnforceCORS = true
	req.Headers = []model.KeyValue{{Enabled: true, Key: "Range", Value: "bytes=-500"}}

	resp := NewApp().SendRequest(req)
	if resp.Error != "" {
		t.Fatalf("unexpected error: %q", resp.Error)
	}
	if optionsCount.Load() != 1 {
		t.Fatalf("a suffix Range is not safelisted and must preflight, got %d OPTIONS", optionsCount.Load())
	}
}

func TestCrossOriginResponseReportsHeadersHiddenFromPageScript(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "https://app.example.com")
		w.Header().Set("Access-Control-Expose-Headers", "X-Total-Count")
		w.Header().Set("X-Total-Count", "42")
		w.Header().Set("ETag", `"v1"`)
		w.Header().Set("Content-Type", "application/json")
		http.SetCookie(w, &http.Cookie{Name: "sid", Value: "1"})
		_, _ = w.Write([]byte(`{}`))
	}))
	defer server.Close()

	req := defaultBrowserReq(server.URL)
	req.BrowserOrigin = "https://app.example.com"
	req.BrowserEnforceCORS = true

	resp := NewApp().SendRequest(req)
	if resp.Error != "" {
		t.Fatalf("unexpected error: %q", resp.Error)
	}
	for _, name := range []string{"Etag", "Set-Cookie", "Access-Control-Allow-Origin"} {
		if !slices.Contains(resp.BrowserHiddenHeaders, name) {
			t.Fatalf("%s must be reported as hidden from page script, got %v", name, resp.BrowserHiddenHeaders)
		}
	}
	for _, name := range []string{"X-Total-Count", "Content-Type", "Content-Length"} {
		if slices.Contains(resp.BrowserHiddenHeaders, name) {
			t.Fatalf("%s is readable by page script, got hidden %v", name, resp.BrowserHiddenHeaders)
		}
	}
	if !hasHeaderKV(resp.Headers, "Etag") {
		t.Fatalf("hidden headers must still be shown in the response, got %v", resp.Headers)
	}
}

func TestExposeHeadersWildcardDependsOnCredentials(t *testing.T) {
	headers := http.Header{}
	headers.Set("Access-Control-Expose-Headers", "*")
	headers.Set("X-Request-Id", "abc")
	headers.Set("Set-Cookie", "sid=1")

	ctx := browserSecurityContext{active: true, enforceCORS: true, origin: "https://app.example.com"}
	if got := corsUnexposedResponseHeaders(headers, ctx); !slices.Equal(got, []string{"Set-Cookie"}) {
		t.Fatalf("wildcard without credentials exposes everything but Set-Cookie, got %v", got)
	}
	ctx.withCredentials = true
	if got := corsUnexposedResponseHeaders(headers, ctx); !slices.Contains(got, "X-Request-Id") {
		t.Fatalf("wildcard is a literal name for a credentialed request, got %v", got)
	}
	ctx.enforceCORS = false
	if got := corsUnexposedResponseHeaders(headers, ctx); got != nil {
		t.Fatalf("a same-origin response hides nothing, got %v", got)
	}
}

func hasHeaderKV(headers []model.KeyValue, name string) bool {
	for _, header := range headers {
		if strings.EqualFold(header.Key, name) {
			return true
		}
	}
	return false
}

type recordedHop struct {
	method        string
	origin        string
	secFetchSite  string
	authorization string
	cookie        string
	contentType   string
}

type hopRecorder struct {
	mu   sync.Mutex
	hops []recordedHop
}

func (h *hopRecorder) record(r *http.Request) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.hops = append(h.hops, recordedHop{
		method:        r.Method,
		origin:        r.Header.Get("Origin"),
		secFetchSite:  r.Header.Get("Sec-Fetch-Site"),
		authorization: r.Header.Get("Authorization"),
		cookie:        r.Header.Get("Cookie"),
		contentType:   r.Header.Get("Content-Type"),
	})
}

func (h *hopRecorder) snapshot() []recordedHop {
	h.mu.Lock()
	defer h.mu.Unlock()
	return append([]recordedHop(nil), h.hops...)
}

func (h *hopRecorder) count(method string) int {
	n := 0
	for _, hop := range h.snapshot() {
		if hop.method == method {
			n++
		}
	}
	return n
}

func TestSameOriginRedirectToCrossOriginRequiresCORS(t *testing.T) {
	var allow atomic.Bool
	var target hopRecorder
	b := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		target.record(r)
		if allow.Load() {
			w.Header().Set("Access-Control-Allow-Origin", r.Header.Get("Origin"))
		}
		_, _ = w.Write([]byte("from b"))
	}))
	defer b.Close()
	a := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, b.URL+"/data", http.StatusFound)
	}))
	defer a.Close()

	req := defaultBrowserReq(a.URL + "/go")
	req.BrowserOrigin = a.URL
	req.BrowserEnforceCORS = true
	app := NewApp()

	resp := app.SendRequest(req)
	if !strings.Contains(resp.Error, "CORS error") || !strings.Contains(resp.Error, "missing Access-Control-Allow-Origin") {
		t.Fatalf("a same-origin request redirected cross-origin must pass CORS at the target, got %q", resp.Error)
	}

	allow.Store(true)
	resp = app.SendRequest(req)
	if resp.Error != "" || resp.Body != "from b" {
		t.Fatalf("redirect target allowing the origin should pass, got error %q body %q", resp.Error, resp.Body)
	}
	hops := target.snapshot()
	if got := hops[len(hops)-1]; got.origin != a.URL || got.secFetchSite != "cross-site" {
		t.Fatalf("redirected hop must keep the page origin and become cross-site, got %+v", got)
	}
}

func TestCrossOriginRedirectChainTaintsOrigin(t *testing.T) {
	var target hopRecorder
	b := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		target.record(r)
		w.Header().Set("Access-Control-Allow-Origin", "https://app.example.com")
		_, _ = w.Write([]byte("from b"))
	}))
	defer b.Close()
	a := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "https://app.example.com")
		http.Redirect(w, r, b.URL+"/data", http.StatusFound)
	}))
	defer a.Close()

	req := defaultBrowserReq(a.URL + "/go")
	req.BrowserOrigin = "https://app.example.com"
	req.BrowserEnforceCORS = true

	resp := NewApp().SendRequest(req)
	if !strings.Contains(resp.Error, "allows origin https://app.example.com, not null") {
		t.Fatalf("after a cross-origin to cross-origin redirect the origin is null, got %q", resp.Error)
	}
	if hops := target.snapshot(); len(hops) != 1 || hops[0].origin != "null" {
		t.Fatalf("redirect target must receive Origin: null, got %+v", hops)
	}
}

func TestCrossOriginRedirectResponseMustPassCORS(t *testing.T) {
	var reached atomic.Int32
	b := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		reached.Add(1)
		w.Header().Set("Access-Control-Allow-Origin", "*")
	}))
	defer b.Close()
	a := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, b.URL, http.StatusFound)
	}))
	defer a.Close()

	req := defaultBrowserReq(a.URL)
	req.BrowserOrigin = "https://app.example.com"
	req.BrowserEnforceCORS = true

	resp := NewApp().SendRequest(req)
	if !strings.Contains(resp.Error, "CORS error: redirect response is missing Access-Control-Allow-Origin") {
		t.Fatalf("a cross-origin redirect response without CORS headers must fail, got %q", resp.Error)
	}
	if reached.Load() != 0 {
		t.Fatalf("the redirect must not be followed, target was reached %d times", reached.Load())
	}
}

func TestRedirectIntoCrossOriginPreflightsTheTarget(t *testing.T) {
	var target hopRecorder
	b := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		target.record(r)
		w.Header().Set("Access-Control-Allow-Origin", r.Header.Get("Origin"))
		if r.Method == http.MethodOptions {
			w.Header().Set("Access-Control-Allow-Methods", "POST")
			w.Header().Set("Access-Control-Allow-Headers", "content-type")
			w.WriteHeader(http.StatusNoContent)
			return
		}
		_, _ = w.Write([]byte("created"))
	}))
	defer b.Close()
	a := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, b.URL+"/items", http.StatusTemporaryRedirect)
	}))
	defer a.Close()

	req := defaultBrowserReq(a.URL + "/items")
	req.Method = http.MethodPost
	req.BodyType = "json"
	req.Body = `{"x":1}`
	req.BrowserOrigin = a.URL
	req.BrowserEnforceCORS = true

	resp := NewApp().SendRequest(req)
	if resp.Error != "" || resp.Body != "created" {
		t.Fatalf("unexpected result: error %q body %q", resp.Error, resp.Body)
	}
	hops := target.snapshot()
	if len(hops) != 2 || hops[0].method != http.MethodOptions || hops[1].method != http.MethodPost {
		t.Fatalf("the cross-origin redirect target must be preflighted before the POST, got %+v", hops)
	}
}

func TestRedirectPreflightRejectionBlocksTheRequest(t *testing.T) {
	var target hopRecorder
	b := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		target.record(r)
		w.Header().Set("Access-Control-Allow-Origin", r.Header.Get("Origin"))
		w.WriteHeader(http.StatusNoContent)
	}))
	defer b.Close()
	a := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, b.URL, http.StatusTemporaryRedirect)
	}))
	defer a.Close()

	req := defaultBrowserReq(a.URL)
	req.Method = http.MethodPut
	req.BrowserOrigin = a.URL
	req.BrowserEnforceCORS = true

	resp := NewApp().SendRequest(req)
	if !strings.Contains(resp.Error, "CORS error: preflight Access-Control-Allow-Methods does not allow PUT") {
		t.Fatalf("got %q", resp.Error)
	}
	if target.count(http.MethodPut) != 0 {
		t.Fatalf("PUT must not reach the target after a failed preflight")
	}
}

func TestBrowserRedirectMethodRules(t *testing.T) {
	var target hopRecorder
	b := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		target.record(r)
		w.Header().Set("Access-Control-Allow-Origin", r.Header.Get("Origin"))
		w.Header().Set("Access-Control-Allow-Methods", "PUT")
		w.Header().Set("Access-Control-Allow-Headers", "content-type")
	}))
	defer b.Close()
	status := atomic.Int32{}
	a := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, b.URL, int(status.Load()))
	}))
	defer a.Close()

	t.Run("303 turns POST into GET without body headers", func(t *testing.T) {
		target.hops = nil
		status.Store(http.StatusSeeOther)
		req := defaultBrowserReq(a.URL)
		req.Method = http.MethodPost
		req.BodyType = "json"
		req.Body = `{"x":1}`
		req.BrowserOrigin = a.URL
		req.BrowserEnforceCORS = true
		resp := NewApp().SendRequest(req)
		if resp.Error != "" {
			t.Fatalf("unexpected error %q", resp.Error)
		}
		hops := target.snapshot()
		if len(hops) != 1 || hops[0].method != http.MethodGet || hops[0].contentType != "" {
			t.Fatalf("expected one GET without Content-Type and no preflight, got %+v", hops)
		}
	})

	t.Run("302 keeps PUT", func(t *testing.T) {
		target.hops = nil
		status.Store(http.StatusFound)
		req := defaultBrowserReq(a.URL)
		req.Method = http.MethodPut
		req.BodyType = "raw"
		req.Body = "payload"
		req.BrowserOrigin = a.URL
		req.BrowserEnforceCORS = true
		resp := NewApp().SendRequest(req)
		if resp.Error != "" {
			t.Fatalf("unexpected error %q", resp.Error)
		}
		if target.count(http.MethodPut) != 1 {
			t.Fatalf("browsers only rewrite POST on 301/302, got %+v", target.snapshot())
		}
	})
}

func TestBrowserRedirectDropsAuthorizationAcrossOrigins(t *testing.T) {
	var target hopRecorder
	b := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		target.record(r)
	}))
	defer b.Close()
	a := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, b.URL, http.StatusFound)
	}))
	defer a.Close()

	req := defaultBrowserReq(a.URL)
	req.BrowserEmulation = true
	req.BrowserOrigin = a.URL
	req.FollowAuthorizationHeader = true
	req.Headers = []model.KeyValue{{Enabled: true, Key: "Authorization", Value: "Bearer secret"}}

	if resp := NewApp().SendRequest(req); resp.Error != "" {
		t.Fatalf("unexpected error %q", resp.Error)
	}
	if hops := target.snapshot(); len(hops) != 1 || hops[0].authorization != "" {
		t.Fatalf("browsers remove Authorization on a cross-origin redirect, got %+v", hops)
	}
}

func TestBrowserRedirectOmitsCookiesOnceTheChainLeavesTheOrigin(t *testing.T) {
	var target hopRecorder
	b := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		target.record(r)
	}))
	defer b.Close()
	a := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/login" {
			http.SetCookie(w, &http.Cookie{Name: "sid", Value: "1", Path: "/"})
			return
		}
		http.Redirect(w, r, b.URL, http.StatusFound)
	}))
	defer a.Close()

	app := NewApp()
	login := defaultBrowserReq(a.URL + "/login")
	login.BrowserEmulation = true
	login.BrowserOrigin = a.URL
	if resp := app.SendRequest(login); resp.Error != "" {
		t.Fatalf("login failed: %q", resp.Error)
	}

	plain := defaultBrowserReq(b.URL)
	if resp := app.SendRequest(plain); resp.Error != "" {
		t.Fatalf("control request failed: %q", resp.Error)
	}
	if hops := target.snapshot(); len(hops) != 1 || hops[0].cookie == "" {
		t.Fatalf("control: the jar should hold a host cookie that also matches b, got %+v", hops)
	}

	req := defaultBrowserReq(a.URL + "/go")
	req.BrowserEmulation = true
	req.BrowserOrigin = a.URL
	if resp := app.SendRequest(req); resp.Error != "" {
		t.Fatalf("unexpected error %q", resp.Error)
	}
	if hops := target.snapshot(); len(hops) != 2 || hops[1].cookie != "" {
		t.Fatalf("credentials mode same-origin must drop cookies after a cross-origin redirect, got %+v", hops)
	}
}

func TestSecFetchSiteStaysCrossSiteAfterReturningToOrigin(t *testing.T) {
	var origin hopRecorder
	var aURL string
	b := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, aURL+"/back", http.StatusFound)
	}))
	defer b.Close()
	a := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin.record(r)
		if r.URL.Path == "/start" {
			http.Redirect(w, r, b.URL, http.StatusFound)
		}
	}))
	defer a.Close()
	aURL = a.URL

	req := defaultBrowserReq(a.URL + "/start")
	req.BrowserEmulation = true
	req.BrowserOrigin = a.URL
	if resp := NewApp().SendRequest(req); resp.Error != "" {
		t.Fatalf("unexpected error %q", resp.Error)
	}
	hops := origin.snapshot()
	if len(hops) != 2 || hops[0].secFetchSite != "same-origin" || hops[1].secFetchSite != "cross-site" {
		t.Fatalf("Sec-Fetch-Site reflects every URL in the redirect chain, got %+v", hops)
	}
}

func TestBrowserRedirectRejectsCredentialsInLocation(t *testing.T) {
	var reached atomic.Int32
	b := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		reached.Add(1)
	}))
	defer b.Close()
	a := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "https://app.example.com")
		withUser, _ := url.Parse(b.URL)
		withUser.User = url.UserPassword("user", "pass")
		http.Redirect(w, r, withUser.String(), http.StatusFound)
	}))
	defer a.Close()

	req := defaultBrowserReq(a.URL)
	req.BrowserOrigin = "https://app.example.com"
	req.BrowserEnforceCORS = true

	resp := NewApp().SendRequest(req)
	if !strings.Contains(resp.Error, "carries credentials in the URL") || strings.Contains(resp.Error, "pass") {
		t.Fatalf("got %q", resp.Error)
	}
	if reached.Load() != 0 {
		t.Fatalf("the redirect must not be followed")
	}
}

func TestMixedContentBlockedWhenBrowserChecksEnforced(t *testing.T) {
	req := defaultBrowserReq("http://api.example.invalid/data")
	req.BrowserOrigin = "https://app.example.com"
	req.BrowserEnforceCORS = true

	resp := NewApp().SendRequest(req)
	if !strings.HasPrefix(resp.Error, "Browser error: Mixed Content") || len(resp.SentRequests) != 0 {
		t.Fatalf("an https page cannot fetch http://, got %q with %d sent", resp.Error, len(resp.SentRequests))
	}
}

func TestMixedContentRules(t *testing.T) {
	page := browserSecurityContext{active: true, corsRequested: true, origin: "https://app.example.com", originURL: mustParseURL(t, "https://app.example.com")}
	cases := []struct {
		target  string
		blocked bool
	}{
		{"http://api.example.com/x", true},
		{"ws://api.example.com/socket", true},
		{"https://api.example.com/x", false},
		{"http://localhost:8080/x", false},
		{"http://api.localhost/x", false},
		{"http://127.0.0.1:3000/x", false},
		{"http://[::1]:3000/x", false},
		{"http://192.168.1.20/x", false},
		{"http://printer.local/x", false},
		{"http://0.0.0.0:8080/x", false},
		{"http://router.lan/x", true},
	}
	for _, tc := range cases {
		msg := blockedBrowserNetworkAccess(mustParseURL(t, tc.target), page)
		if (msg != "") != tc.blocked {
			t.Fatalf("%s: blocked=%v, want %v (%q)", tc.target, msg != "", tc.blocked, msg)
		}
	}

	insecurePage := page
	insecurePage.originURL = mustParseURL(t, "http://app.example.com")
	if msg := blockedBrowserNetworkAccess(mustParseURL(t, "http://api.example.com/x"), insecurePage); msg != "" {
		t.Fatalf("an http page has no mixed content, got %q", msg)
	}

	emulationOnly := page
	emulationOnly.corsRequested = false
	target := mustParseURL(t, "http://api.example.com/x")
	if msg := blockedBrowserNetworkAccess(target, emulationOnly); msg != "" {
		t.Fatalf("without enforcement mixed content is reported, not blocked: %q", msg)
	}
	if warnings := browserNetworkAccessWarnings(target, "", false, emulationOnly); len(warnings) != 1 || !strings.Contains(warnings[0], "Mixed Content") {
		t.Fatalf("expected a mixed content warning, got %v", warnings)
	}
}

func TestLocalNetworkAccessWarnings(t *testing.T) {
	secure := browserSecurityContext{active: true, kind: browserKindFetch, origin: "https://app.example.com", originURL: mustParseURL(t, "https://app.example.com")}
	insecure := secure
	insecure.originURL = mustParseURL(t, "http://app.example.com")
	loopbackPage := secure
	loopbackPage.originURL = mustParseURL(t, "http://localhost:5173")
	localPage := secure
	localPage.originURL = mustParseURL(t, "https://192.168.1.5")
	handshake := secure
	handshake.kind = browserKindHandshake

	cases := []struct {
		name    string
		ctx     browserSecurityContext
		target  string
		remote  string
		proxied bool
		want    string
	}{
		{"public page to loopback", secure, "http://localhost:8080/x", "", false, "asks the user for permission"},
		{"public page to private literal", secure, "http://10.0.0.7/x", "", false, "(local network)"},
		{"public page to name resolving local", secure, "https://nas.example.com/x", "192.168.1.9:443", false, "(local network)"},
		{"insecure page to loopback", insecure, "http://127.0.0.1:8080/x", "", false, "not a secure context"},
		{"loopback page to loopback", loopbackPage, "http://127.0.0.1:8080/x", "", false, ""},
		{"local page to local", localPage, "http://10.0.0.7/x", "", false, ""},
		{"local page to loopback", localPage, "http://localhost/x", "", false, "(loopback)"},
		{"public page to public", secure, "https://api.example.com/x", "93.184.216.34:443", false, ""},
		{"proxied connection is not classified", secure, "https://nas.example.com/x", "192.168.1.9:443", true, ""},
		{"websocket is not gated yet", handshake, "wss://localhost/x", "", false, ""},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			warnings := browserNetworkAccessWarnings(mustParseURL(t, tc.target), tc.remote, tc.proxied, tc.ctx)
			if tc.want == "" {
				if len(warnings) != 0 {
					t.Fatalf("expected no warning, got %v", warnings)
				}
				return
			}
			if len(warnings) != 1 || !strings.Contains(warnings[0], "Local Network Access") || !strings.Contains(warnings[0], tc.want) {
				t.Fatalf("expected a Local Network Access warning containing %q, got %v", tc.want, warnings)
			}
		})
	}
}

func TestPublicPageToLocalServerReportsLocalNetworkAccess(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "https://app.example.com")
	}))
	defer server.Close()

	req := defaultBrowserReq(server.URL)
	req.BrowserOrigin = "https://app.example.com"
	req.BrowserEnforceCORS = true

	resp := NewApp().SendRequest(req)
	if resp.Error != "" {
		t.Fatalf("unexpected error %q", resp.Error)
	}
	found := false
	for _, warning := range resp.Warnings {
		if strings.Contains(warning, "Local Network Access") && strings.Contains(warning, "(loopback)") {
			found = true
		}
	}
	if !found {
		t.Fatalf("expected a Local Network Access warning, got %v", resp.Warnings)
	}
}

func mustParseURL(t *testing.T, raw string) *url.URL {
	t.Helper()
	u, err := url.Parse(raw)
	if err != nil {
		t.Fatal(err)
	}
	return u
}

func TestSSERedirectToCrossOriginRequiresCORS(t *testing.T) {
	b := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		_, _ = w.Write([]byte("data: hi\n\n"))
	}))
	defer b.Close()
	a := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, b.URL, http.StatusFound)
	}))
	defer a.Close()

	em := &testEmitter{}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	runStreamWithEmitter(ctx, model.HttpRequest{URL: a.URL, EnableSSLVerification: true, BrowserOrigin: a.URL, BrowserEnforceCORS: true}, em)

	em.mu.Lock()
	defer em.mu.Unlock()
	if len(em.opens) != 0 || len(em.errors) == 0 || !strings.Contains(em.errors[0].Message, "missing Access-Control-Allow-Origin") {
		t.Fatalf("an EventSource redirected cross-origin must pass CORS, got opens=%d errors=%+v", len(em.opens), em.errors)
	}
}
