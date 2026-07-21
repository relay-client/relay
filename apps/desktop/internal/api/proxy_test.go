package api

import (
	"net/http"
	"strings"
	"testing"

	"github.com/relay-client/relay/apps/desktop/internal/model"
)

func mustRequest(t *testing.T, target string) *http.Request {
	t.Helper()
	r, err := http.NewRequest(http.MethodGet, target, nil)
	if err != nil {
		t.Fatalf("new request: %v", err)
	}
	return r
}

func TestProxyForRequestModes(t *testing.T) {
	t.Run("off returns no proxy", func(t *testing.T) {
		if fn := proxyForRequest(model.HttpRequest{ProxyMode: "off", ProxyURL: "http://x:1"}); fn != nil {
			t.Fatalf("expected nil proxy func for mode off, got non-nil")
		}
	})

	t.Run("legacy empty url uses environment resolver", func(t *testing.T) {
		if fn := proxyForRequest(model.HttpRequest{}); fn == nil {
			t.Fatalf("expected non-nil (ProxyFromEnvironment) for legacy empty url")
		}
	})

	t.Run("on builds explicit proxy", func(t *testing.T) {
		fn := proxyForRequest(model.HttpRequest{ProxyMode: "on", ProxyURL: "http://proxy.example.com:8080"})
		if fn == nil {
			t.Fatalf("expected non-nil proxy func")
		}
		got, err := fn(mustRequest(t, "https://api.target.com/x"))
		if err != nil || got == nil || got.String() != "http://proxy.example.com:8080" {
			t.Fatalf("got %v err %v, want http://proxy.example.com:8080", got, err)
		}
	})

	t.Run("legacy url set behaves like on", func(t *testing.T) {
		fn := proxyForRequest(model.HttpRequest{ProxyURL: "http://legacy:3128"})
		got, err := fn(mustRequest(t, "https://api.target.com/x"))
		if err != nil || got == nil || got.String() != "http://legacy:3128" {
			t.Fatalf("got %v err %v, want http://legacy:3128", got, err)
		}
	})

	t.Run("on with bypass skips matching hosts", func(t *testing.T) {
		fn := proxyForRequest(model.HttpRequest{
			ProxyMode:   "on",
			ProxyURL:    "http://proxy.example.com:8080",
			ProxyBypass: "localhost, .internal, skip.example.com",
		})
		bypassed := []string{"http://localhost/x", "http://api.internal/x", "http://skip.example.com/x"}
		for _, target := range bypassed {
			got, err := fn(mustRequest(t, target))
			if err != nil || got != nil {
				t.Fatalf("target %s: expected no proxy (bypass), got %v err %v", target, got, err)
			}
		}
		got, err := fn(mustRequest(t, "https://api.external.com/x"))
		if err != nil || got == nil || got.String() != "http://proxy.example.com:8080" {
			t.Fatalf("non-bypassed host should use proxy, got %v err %v", got, err)
		}
	})

	t.Run("invalid explicit proxy url returns an error", func(t *testing.T) {
		fn := proxyForRequest(model.HttpRequest{ProxyMode: "on", ProxyURL: "://bad"})
		if fn == nil {
			t.Fatalf("expected non-nil proxy func")
		}
		if got, err := fn(mustRequest(t, "https://api.target.com/x")); err == nil || got != nil {
			t.Fatalf("expected invalid proxy error and no proxy URL, got %v err %v", got, err)
		}
	})

	t.Run("invalid proxy url error never leaks credentials", func(t *testing.T) {
		fn := proxyForRequest(model.HttpRequest{ProxyMode: "on", ProxyURL: "http://user:sup3rsecret@bad host:8080"})
		if fn == nil {
			t.Fatalf("expected non-nil proxy func")
		}
		got, err := fn(mustRequest(t, "https://api.target.com/x"))
		if err == nil || got != nil {
			t.Fatalf("expected invalid proxy error and no proxy URL, got %v err %v", got, err)
		}
		if strings.Contains(err.Error(), "sup3rsecret") {
			t.Fatalf("proxy password leaked into error: %v", err)
		}
		if !strings.Contains(err.Error(), "***@bad host:8080") {
			t.Fatalf("expected redacted authority in error, got %v", err)
		}
	})

	t.Run("empty explicit proxy url returns an error", func(t *testing.T) {
		fn := proxyForRequest(model.HttpRequest{ProxyMode: "on"})
		if fn == nil {
			t.Fatalf("expected non-nil proxy func")
		}
		if got, err := fn(mustRequest(t, "https://api.target.com/x")); err == nil || got != nil {
			t.Fatalf("expected missing proxy error and no proxy URL, got %v err %v", got, err)
		}
	})
}

func TestParseProxyBypass(t *testing.T) {
	got := parseProxyBypass(" localhost,, .internal\n 10.0.0.1 ;example.com\t")
	want := []string{"localhost", ".internal", "10.0.0.1", "example.com"}
	if len(got) != len(want) {
		t.Fatalf("got %v, want %v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("got %v, want %v", got, want)
		}
	}
	if parseProxyBypass("   ") != nil {
		t.Fatalf("blank bypass should be nil")
	}
}

func TestHostMatchesProxyBypass(t *testing.T) {
	cases := []struct {
		host   string
		bypass []string
		want   bool
	}{
		{"localhost", []string{"localhost"}, true},
		{"API.Internal", []string{".internal"}, true},
		{"deep.api.internal", []string{"internal"}, true},
		{"notinternal.com", []string{"internal"}, false},
		{"anything.com", []string{"*"}, true},
		{"sub.example.com", []string{"*.example.com"}, true},
		{"example.com", []string{"sub.example.com"}, false},
		{"", []string{"*"}, false},
	}
	for _, c := range cases {
		if got := hostMatchesProxyBypass(c.host, c.bypass); got != c.want {
			t.Fatalf("host=%q bypass=%v: got %v want %v", c.host, c.bypass, got, c.want)
		}
	}
}

func TestRedactProxyURL(t *testing.T) {
	cases := []struct {
		in   string
		want string
	}{
		{"", ""},
		{"  ", ""},
		{"http://user:pass@proxy:8080", "http://***@proxy:8080"},
		{"socks5://user:pass@host", "socks5://***@host"},
		{"http://user@host:3128", "http://***@host:3128"},
		{"http://user:p@ss:word@host:3128", "http://***@host:3128"},
		{"http://user:pass@host/path?q=1#f", "http://***@host/path?q=1#f"},
		{"http://proxy.example.com:8080", "http://proxy.example.com:8080"},
		{"proxy.example.com:8080", "proxy.example.com:8080"},
		{"://bad", "://bad"},
		{"user:pass@host:8080", "***@host:8080"},
	}
	for _, c := range cases {
		if got := redactProxyURL(c.in); got != c.want {
			t.Fatalf("redactProxyURL(%q) = %q, want %q", c.in, got, c.want)
		}
	}
}
