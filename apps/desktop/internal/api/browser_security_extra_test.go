package api

import (
	"net/http"
	"net/http/httptest"
	"net/url"
	"strconv"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/relay-client/relay/apps/desktop/internal/model"
)

func TestCSPKeywordsCaseInsensitive(t *testing.T) {
	protected := mustURL("https://app.example.com")
	target := mustURL("https://app.example.com/api")
	if !cspSourceAllows("'SELF'", target, protected) {
		t.Fatal("'SELF' should match 'self' case-insensitively")
	}
	if cspSourceAllows("'NONE'", target, protected) {
		t.Fatal("'NONE' must behave like 'none' (deny)")
	}
	if !cspSourceAllows("'Self'", target, protected) {
		t.Fatal("'Self' should match 'self' case-insensitively")
	}
}

func TestCSPNoneMixedWithOthersBlocks(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()
	target, _ := url.Parse(server.URL)

	req := defaultBrowserReq(server.URL)
	req.BrowserOrigin = "https://app.example.com"
	req.BrowserEnforceCSP = true
	// Per CSP spec, 'none' alongside other sources still blocks.
	req.BrowserCSP = "connect-src 'none' http://" + target.Host

	resp := NewApp().SendRequest(req)
	if !strings.Contains(resp.Error, "CSP error") {
		t.Fatalf("'none' must block even when mixed with other sources, got %q", resp.Error)
	}
}

func TestCSPBlockedResponseHasTimings(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	req := defaultBrowserReq(server.URL)
	req.BrowserOrigin = "https://app.example.com"
	req.BrowserEnforceCSP = true
	req.BrowserCSP = "connect-src 'none'"

	resp := NewApp().SendRequest(req)
	if !strings.Contains(resp.Error, "CSP error") {
		t.Fatalf("expected CSP block, got %q", resp.Error)
	}
	if resp.Duration < 0 {
		t.Fatalf("Duration should be non-negative, got %d", resp.Duration)
	}
	if resp.Timings.Total < 0 {
		t.Fatalf("Timings.Total should be non-negative, got %v", resp.Timings.Total)
	}
}

func TestInvalidOriginErrorHasTimings(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	req := defaultBrowserReq(server.URL)
	req.BrowserEnforceCORS = true
	req.BrowserOrigin = "ftp://example.com"

	resp := NewApp().SendRequest(req)
	if !strings.Contains(resp.Error, "Use http:// or https://") {
		t.Fatalf("expected origin scheme rejection, got %q", resp.Error)
	}
	if resp.Duration < 0 {
		t.Fatalf("Duration should be set on early errors, got %d", resp.Duration)
	}
}

func TestPreflightCacheReusesResultWithinMaxAge(t *testing.T) {
	var optionsCount atomic.Int32
	var actualCount atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodOptions {
			optionsCount.Add(1)
			w.Header().Set("Access-Control-Allow-Origin", "https://app.example.com")
			w.Header().Set("Access-Control-Allow-Methods", "POST")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, X-Custom")
			w.Header().Set("Access-Control-Max-Age", "60")
			w.WriteHeader(http.StatusNoContent)
			return
		}
		actualCount.Add(1)
		w.Header().Set("Access-Control-Allow-Origin", "https://app.example.com")
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	app := NewApp()
	req := defaultBrowserReq(server.URL)
	req.Method = http.MethodPost
	req.BodyType = "json"
	req.Body = `{"a":1}`
	req.BrowserOrigin = "https://app.example.com"
	req.BrowserEnforceCORS = true
	req.Headers = []model.KeyValue{{Enabled: true, Key: "X-Custom", Value: "v"}}

	for i := 0; i < 3; i++ {
		resp := app.SendRequest(req)
		if resp.Error != "" {
			t.Fatalf("iteration %d unexpected error: %q", i, resp.Error)
		}
	}

	if got := optionsCount.Load(); got != 1 {
		t.Fatalf("expected exactly 1 preflight thanks to Max-Age cache, got %d", got)
	}
	if got := actualCount.Load(); got != 3 {
		t.Fatalf("expected 3 actual requests, got %d", got)
	}
}

func TestPreflightCacheNotReusedWithoutMaxAge(t *testing.T) {
	var optionsCount atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodOptions {
			optionsCount.Add(1)
			w.Header().Set("Access-Control-Allow-Origin", "https://app.example.com")
			w.Header().Set("Access-Control-Allow-Methods", "POST")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
			// No Access-Control-Max-Age — must not cache.
			w.WriteHeader(http.StatusNoContent)
			return
		}
		w.Header().Set("Access-Control-Allow-Origin", "https://app.example.com")
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	app := NewApp()
	req := defaultBrowserReq(server.URL)
	req.Method = http.MethodPost
	req.BodyType = "json"
	req.Body = `{"a":1}`
	req.BrowserOrigin = "https://app.example.com"
	req.BrowserEnforceCORS = true

	for i := 0; i < 3; i++ {
		resp := app.SendRequest(req)
		if resp.Error != "" {
			t.Fatalf("iteration %d unexpected error: %q", i, resp.Error)
		}
	}
	if got := optionsCount.Load(); got != 3 {
		t.Fatalf("without Max-Age every request must preflight, got %d", got)
	}
}

func TestPreflightCacheExpiresAfterMaxAge(t *testing.T) {
	cache := newPreflightCache()
	now := time.Unix(1_700_000_000, 0)
	cache.now = func() time.Time { return now }

	cache.store("k", preflightCacheEntry{
		allowOrigin:  "*",
		allowMethods: "GET",
		expiresAt:    now.Add(10 * time.Second),
	})
	if _, ok := cache.lookup("k"); !ok {
		t.Fatal("cache entry must be available within Max-Age")
	}
	now = now.Add(11 * time.Second)
	if _, ok := cache.lookup("k"); ok {
		t.Fatal("cache entry must be expired after Max-Age")
	}
}

func TestPreflightCacheMaxAgeClamp(t *testing.T) {
	if got := parsePreflightMaxAge("99999"); got <= 0 {
		t.Fatalf("non-zero parse expected, got %v", got)
	}
	if got := parsePreflightMaxAge(""); got != 0 {
		t.Fatalf("empty value should be 0, got %v", got)
	}
	if got := parsePreflightMaxAge("-1"); got != 0 {
		t.Fatalf("negative value should be 0, got %v", got)
	}
	if got := parsePreflightMaxAge("abc"); got != 0 {
		t.Fatalf("non-numeric should be 0, got %v", got)
	}
}

func TestPreflightCacheClampsAtFiveMinutes(t *testing.T) {
	var optionsCount atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodOptions {
			optionsCount.Add(1)
			w.Header().Set("Access-Control-Allow-Origin", "https://app.example.com")
			w.Header().Set("Access-Control-Allow-Methods", "POST")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
			w.Header().Set("Access-Control-Max-Age", "99999999")
			w.WriteHeader(http.StatusNoContent)
			return
		}
		w.Header().Set("Access-Control-Allow-Origin", "https://app.example.com")
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	app := NewApp()
	// Drive the cache's clock so we can observe clamp behaviour.
	now := time.Unix(2_000_000_000, 0)
	app.preflightCache.now = func() time.Time { return now }

	req := defaultBrowserReq(server.URL)
	req.Method = http.MethodPost
	req.BodyType = "json"
	req.Body = `{}`
	req.BrowserOrigin = "https://app.example.com"
	req.BrowserEnforceCORS = true

	if resp := app.SendRequest(req); resp.Error != "" {
		t.Fatalf("first request errored: %q", resp.Error)
	}
	// Within clamp (5 min): cache should serve.
	now = now.Add(4 * time.Minute)
	if resp := app.SendRequest(req); resp.Error != "" {
		t.Fatalf("within clamp errored: %q", resp.Error)
	}
	if got := optionsCount.Load(); got != 1 {
		t.Fatalf("within clamp expected 1 preflight, got %d", got)
	}
	// Beyond clamp (>5 min): cache should expire.
	now = now.Add(2 * time.Minute)
	if resp := app.SendRequest(req); resp.Error != "" {
		t.Fatalf("beyond clamp errored: %q", resp.Error)
	}
	if got := optionsCount.Load(); got != 2 {
		t.Fatalf("beyond clamp expected new preflight, got %d", got)
	}
}

func TestPreflightCacheInvalidatedWhenNewHeaderAppears(t *testing.T) {
	var optionsCount atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodOptions {
			optionsCount.Add(1)
			gotHeaders := r.Header.Get("Access-Control-Request-Headers")
			w.Header().Set("Access-Control-Allow-Origin", "https://app.example.com")
			w.Header().Set("Access-Control-Allow-Methods", "POST")
			// Only allow what was actually asked for.
			w.Header().Set("Access-Control-Allow-Headers", gotHeaders)
			w.Header().Set("Access-Control-Max-Age", "60")
			w.WriteHeader(http.StatusNoContent)
			return
		}
		w.Header().Set("Access-Control-Allow-Origin", "https://app.example.com")
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	app := NewApp()
	base := defaultBrowserReq(server.URL)
	base.Method = http.MethodPost
	base.BodyType = "json"
	base.Body = `{}`
	base.BrowserOrigin = "https://app.example.com"
	base.BrowserEnforceCORS = true

	first := base
	first.Headers = []model.KeyValue{{Enabled: true, Key: "X-First", Value: "1"}}
	if resp := app.SendRequest(first); resp.Error != "" {
		t.Fatalf("first request errored: %q", resp.Error)
	}

	second := base
	second.Headers = []model.KeyValue{{Enabled: true, Key: "X-Second", Value: "2"}}
	if resp := app.SendRequest(second); resp.Error != "" {
		t.Fatalf("second request errored: %q", resp.Error)
	}
	if got := optionsCount.Load(); got != 2 {
		t.Fatalf("new header must invalidate cache, got %d preflights", got)
	}
}

func TestSecFetchSiteUpdatedOnCrossOriginRedirect(t *testing.T) {
	var sawCrossSite, sawSameOrigin atomic.Bool

	// inner accepts redirected request and verifies header.
	inner := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Sec-Fetch-Site") == "cross-site" {
			sawCrossSite.Store(true)
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer inner.Close()

	// outer redirects to inner (different host means cross-origin from inner-relative-to-origin too).
	outer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Sec-Fetch-Site") == "same-origin" {
			sawSameOrigin.Store(true)
		}
		http.Redirect(w, r, inner.URL, http.StatusFound)
	}))
	defer outer.Close()

	req := defaultBrowserReq(outer.URL)
	req.BrowserEmulation = true
	req.BrowserOrigin = outer.URL // first hop is same-origin
	resp := NewApp().SendRequest(req)
	if resp.Error != "" {
		t.Fatalf("unexpected error: %q", resp.Error)
	}
	if !sawSameOrigin.Load() {
		t.Fatal("expected same-origin on first hop (Origin == outer.URL)")
	}
	if !sawCrossSite.Load() {
		t.Fatal("expected Sec-Fetch-Site to flip to cross-site on redirect to a different host")
	}
}

func TestSecFetchSiteUpdatedOnSameOriginRedirect(t *testing.T) {
	var hits atomic.Int32
	var crossSiteHits atomic.Int32
	var sameOriginHits atomic.Int32

	var server *httptest.Server
	server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.Header.Get("Sec-Fetch-Site") {
		case "cross-site":
			crossSiteHits.Add(1)
		case "same-origin":
			sameOriginHits.Add(1)
		}
		hits.Add(1)
		if r.URL.Path == "/start" {
			http.Redirect(w, r, server.URL+"/dest", http.StatusFound)
			return
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	req := defaultBrowserReq(server.URL + "/start")
	req.BrowserEmulation = true
	req.BrowserOrigin = "https://app.example.com" // cross-origin to server
	resp := NewApp().SendRequest(req)
	if resp.Error != "" {
		t.Fatalf("unexpected error: %q", resp.Error)
	}
	if hits.Load() != 2 {
		t.Fatalf("expected 2 hits, got %d", hits.Load())
	}
	if sameOriginHits.Load() != 0 {
		t.Fatalf("redirected request must remain cross-site (origin still https://app.example.com), got same-origin hits=%d", sameOriginHits.Load())
	}
	if crossSiteHits.Load() != 2 {
		t.Fatalf("both hops cross-site to fixed app.example.com origin, got %d", crossSiteHits.Load())
	}
}

func TestPreflightCacheKeyExcludesQueryDifference(t *testing.T) {
	// Cache key uses the URL incl. query — different queries are different resources.
	// We verify that two different queries result in two preflights (no false cache hit).
	var optionsCount atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodOptions {
			optionsCount.Add(1)
			w.Header().Set("Access-Control-Allow-Origin", "https://app.example.com")
			w.Header().Set("Access-Control-Allow-Methods", "POST")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
			w.Header().Set("Access-Control-Max-Age", "60")
			w.WriteHeader(http.StatusNoContent)
			return
		}
		w.Header().Set("Access-Control-Allow-Origin", "https://app.example.com")
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	app := NewApp()
	req := defaultBrowserReq(server.URL + "/x?a=1")
	req.Method = http.MethodPost
	req.BodyType = "json"
	req.Body = `{}`
	req.BrowserOrigin = "https://app.example.com"
	req.BrowserEnforceCORS = true

	if resp := app.SendRequest(req); resp.Error != "" {
		t.Fatalf("first: %q", resp.Error)
	}
	req2 := req
	req2.URL = server.URL + "/x?a=2"
	if resp := app.SendRequest(req2); resp.Error != "" {
		t.Fatalf("second: %q", resp.Error)
	}
	if got := optionsCount.Load(); got != 2 {
		t.Fatalf("different query strings should miss the cache, got %d preflights", got)
	}
}

func TestPreflightCacheCredentialedDoesNotShareWithUncredentialed(t *testing.T) {
	var optionsCount atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodOptions {
			optionsCount.Add(1)
			w.Header().Set("Access-Control-Allow-Origin", "*")
			w.Header().Set("Access-Control-Allow-Methods", "POST")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
			w.Header().Set("Access-Control-Max-Age", "60")
			w.WriteHeader(http.StatusNoContent)
			return
		}
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	app := NewApp()
	uncredentialed := defaultBrowserReq(server.URL)
	uncredentialed.Method = http.MethodPost
	uncredentialed.BodyType = "json"
	uncredentialed.Body = `{}`
	uncredentialed.BrowserOrigin = "https://app.example.com"
	uncredentialed.BrowserEnforceCORS = true
	resp := app.SendRequest(uncredentialed)
	if resp.Error != "" {
		t.Fatalf("uncredentialed: %q", resp.Error)
	}

	credentialed := uncredentialed
	credentialed.BrowserWithCredentials = true
	resp = app.SendRequest(credentialed)
	// '*' with credentials must reject and re-preflight.
	if !strings.Contains(resp.Error, "credentials require the exact origin") {
		t.Fatalf("credentialed request must not silently reuse a wildcard preflight, got %q", resp.Error)
	}
	if got := optionsCount.Load(); got < 2 {
		t.Fatalf("credentialed request should bypass cache and retry preflight, got %d", got)
	}
}

func TestPreflightCacheKeyDifferentOriginsAreDifferentKeys(t *testing.T) {
	if preflightCacheKey("https://a.example", "https://x", false) == preflightCacheKey("https://b.example", "https://x", false) {
		t.Fatal("cache keys for different origins must differ")
	}
}

func TestPreflightCacheStoresWithIntegerMaxAge(t *testing.T) {
	cache := newPreflightCache()
	now := time.Unix(1_700_000_000, 0)
	cache.now = func() time.Time { return now }
	resp := &http.Response{
		Header: http.Header{
			"Access-Control-Allow-Origin":  []string{"https://app.example.com"},
			"Access-Control-Allow-Methods": []string{"POST"},
			"Access-Control-Allow-Headers": []string{"Content-Type"},
			"Access-Control-Max-Age":       []string{strconv.Itoa(120)},
		},
	}
	cachePreflightResponse(cache, "k", resp)
	entry, ok := cache.lookup("k")
	if !ok {
		t.Fatal("entry must be stored")
	}
	if entry.allowOrigin != "https://app.example.com" {
		t.Fatalf("origin mismatch: %s", entry.allowOrigin)
	}
	if !entry.expiresAt.Equal(now.Add(120 * time.Second)) {
		t.Fatalf("expiresAt mismatch: %v", entry.expiresAt)
	}
}
