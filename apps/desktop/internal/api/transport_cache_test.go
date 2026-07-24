package api

import (
	"net"
	"net/http"
	"net/http/httptest"
	"strconv"
	"sync"
	"testing"
	"time"

	"github.com/relay-client/relay/apps/desktop/internal/model"
)

func baseTransportTestRequest(url string) model.HttpRequest {
	return model.HttpRequest{
		Method:                http.MethodGet,
		URL:                   url,
		FollowRedirects:       true,
		TimeoutMs:             5000,
		HTTPVersion:           "auto",
		EnableSSLVerification: true,
		MaxRedirects:          10,
	}
}

// Every send used to build its own transport, so no connection was ever
// reused: each request paid a fresh TCP (and, over TLS, handshake) round trip.
func TestSendRequestReusesConnections(t *testing.T) {
	httpTransports.closeAll()
	t.Cleanup(httpTransports.closeAll)

	var mu sync.Mutex
	connections := 0

	// ConnState has to be wired before Start: the running server reads it from
	// its own goroutine.
	server := httptest.NewUnstartedServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	server.Config.ConnState = func(_ net.Conn, state http.ConnState) {
		if state == http.StateNew {
			mu.Lock()
			connections++
			mu.Unlock()
		}
	}
	server.Start()
	defer server.Close()

	app := NewApp()
	for i := 0; i < 3; i++ {
		if resp := app.SendRequest(baseTransportTestRequest(server.URL)); resp.Error != "" {
			t.Fatalf("request %d failed: %s", i+1, resp.Error)
		}
	}

	mu.Lock()
	got := connections
	mu.Unlock()
	if got != 1 {
		t.Fatalf("expected 3 requests to share 1 connection, got %d connections", got)
	}
}

// Turning off certificate verification must not let a request inherit a
// connection that was opened under verification (or hand one over to it).
func TestTransportCacheSeparatesTLSVerificationModes(t *testing.T) {
	cache := newTransportCache()
	t.Cleanup(cache.closeAll)

	verified := baseTransportTestRequest("https://example.com")
	insecure := verified
	insecure.EnableSSLVerification = false

	if cache.get(verified) == cache.get(insecure) {
		t.Fatal("expected separate transports for verified and insecure requests")
	}
	if cache.get(verified) != cache.get(verified) {
		t.Fatal("expected the same transport for identical configurations")
	}
	if len(cache.entries) != 2 {
		t.Fatalf("expected 2 cached transports, got %d", len(cache.entries))
	}
}

func TestTransportCacheSeparatesProxyAndHTTPVersion(t *testing.T) {
	cache := newTransportCache()
	t.Cleanup(cache.closeAll)

	base := baseTransportTestRequest("https://example.com")

	proxied := base
	proxied.ProxyMode = "on"
	proxied.ProxyURL = "http://127.0.0.1:8080"

	otherProxy := proxied
	otherProxy.ProxyURL = "http://127.0.0.1:9090"

	forced11 := base
	forced11.HTTPVersion = "1.1"

	for _, req := range []model.HttpRequest{base, proxied, otherProxy, forced11} {
		cache.get(req)
	}
	if len(cache.entries) != 4 {
		t.Fatalf("expected 4 cached transports, got %d", len(cache.entries))
	}

	if transport := cache.get(forced11); transport.ForceAttemptHTTP2 {
		t.Fatal("expected HTTP/1.1 request to disable HTTP/2")
	}
}

// "off" ignores the proxy URL, so those requests should land on one transport
// instead of fragmenting the cache per stale URL left in the settings.
func TestTransportCacheIgnoresProxyURLWhenProxyIsOff(t *testing.T) {
	cache := newTransportCache()
	t.Cleanup(cache.closeAll)

	first := baseTransportTestRequest("https://example.com")
	first.ProxyMode = "off"
	first.ProxyURL = "http://127.0.0.1:8080"

	second := first
	second.ProxyURL = "http://127.0.0.1:9090"

	if cache.get(first) != cache.get(second) {
		t.Fatal("expected one shared transport when the proxy is off")
	}
}

func TestTransportCacheEvictsLeastRecentlyUsed(t *testing.T) {
	cache := newTransportCache()
	t.Cleanup(cache.closeAll)

	now := time.Unix(0, 0)
	cache.now = func() time.Time { return now }

	req := func(port int) model.HttpRequest {
		out := baseTransportTestRequest("https://example.com")
		out.ProxyMode = "on"
		out.ProxyURL = "http://127.0.0.1:" + strconv.Itoa(port)
		return out
	}

	first := req(1)
	firstTransport := cache.get(first)

	for port := 2; port <= maxCachedTransports; port++ {
		now = now.Add(time.Second)
		cache.get(req(port))
	}
	if len(cache.entries) != maxCachedTransports {
		t.Fatalf("expected cache to fill to %d, got %d", maxCachedTransports, len(cache.entries))
	}

	// Touching the oldest entry makes it the newest, so the next insert must
	// evict entry 2 instead.
	now = now.Add(time.Second)
	if cache.get(first) != firstTransport {
		t.Fatal("expected the oldest entry to still be cached")
	}

	now = now.Add(time.Second)
	cache.get(req(maxCachedTransports + 1))

	if len(cache.entries) != maxCachedTransports {
		t.Fatalf("expected cache to stay at %d, got %d", maxCachedTransports, len(cache.entries))
	}
	if cache.get(first) != firstTransport {
		t.Fatal("expected the recently used entry to survive eviction")
	}
	if _, ok := cache.entries[newTransportKey(req(2))]; ok {
		t.Fatal("expected the least recently used entry to be evicted")
	}
}

func TestTransportCacheCloseAllEmptiesCache(t *testing.T) {
	cache := newTransportCache()
	cache.get(baseTransportTestRequest("https://example.com"))
	cache.closeAll()

	if len(cache.entries) != 0 {
		t.Fatalf("expected an empty cache after closeAll, got %d entries", len(cache.entries))
	}
}
