package api

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"github.com/relay-client/relay/apps/desktop/internal/model"
)

func TestNormalizeBrowserOriginStripsDefaultPort(t *testing.T) {
	cases := []struct {
		raw      string
		expected string
	}{
		{"https://example.com:443", "https://example.com"},
		{"http://example.com:80", "http://example.com"},
		{"https://example.com:8443", "https://example.com:8443"},
		{"http://localhost:80", "http://localhost"},
		{"HTTPS://EXAMPLE.COM:443/path?q=1", "https://example.com"},
		{"localhost:5173", "http://localhost:5173"},
		{"app.example.com", "http://app.example.com"},
		{"//app.example.com", "http://app.example.com"},
	}
	for _, tc := range cases {
		t.Run(tc.raw, func(t *testing.T) {
			got, _, err := normalizeBrowserOrigin(tc.raw)
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if got != tc.expected {
				t.Fatalf("normalize(%q): expected %q, got %q", tc.raw, tc.expected, got)
			}
		})
	}
}

func TestCSPHttpSourceMatchesHttpsTarget(t *testing.T) {
	target, _ := url.Parse("https://api.example.com/data")
	protected, _ := url.Parse("http://app.example.com")
	if !cspSourceAllows("http://api.example.com", target, protected) {
		t.Fatalf("CSP source http://api.example.com must allow https://api.example.com/data per CSP3 spec")
	}
	if !cspSourceAllows("http:", target, protected) {
		t.Fatalf("CSP scheme http: must allow https target per CSP3 spec")
	}
}

func TestCSPHttpsSourceDoesNotMatchHttpTarget(t *testing.T) {
	target, _ := url.Parse("http://api.example.com/data")
	protected, _ := url.Parse("https://app.example.com")
	if cspSourceAllows("https://api.example.com", target, protected) {
		t.Fatalf("CSP source https://api.example.com must NOT allow http target (downgrade)")
	}
}

func TestSendRequestBrowserEmulationStripsDefaultPortFromOrigin(t *testing.T) {
	var gotOrigin string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotOrigin = r.Header.Get("Origin")
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	resp := NewApp().SendRequest(model.HttpRequest{
		Method:                http.MethodGet,
		URL:                   server.URL,
		BrowserEmulation:      true,
		BrowserOrigin:         "https://app.example.com:443",
		FollowRedirects:       true,
		TimeoutMs:             5000,
		HTTPVersion:           "auto",
		EnableSSLVerification: true,
		MaxRedirects:          10,
	})
	if resp.Error != "" {
		t.Fatalf("unexpected response error: %s", resp.Error)
	}
	if gotOrigin != "https://app.example.com" {
		t.Fatalf("expected default port to be stripped from Origin, got %q", gotOrigin)
	}
}

func TestSendRequestCORSEnforceWithDefaultPortOrigin(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "https://app.example.com")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	}))
	defer server.Close()

	resp := NewApp().SendRequest(model.HttpRequest{
		Method:                http.MethodGet,
		URL:                   server.URL,
		BrowserOrigin:         "https://app.example.com:443",
		BrowserEnforceCORS:    true,
		FollowRedirects:       true,
		TimeoutMs:             5000,
		HTTPVersion:           "auto",
		EnableSSLVerification: true,
		MaxRedirects:          10,
	})
	if resp.Error != "" {
		t.Fatalf("expected CORS to pass when origin port is the default, got %q", resp.Error)
	}
}

func TestSendRequestCSPHttpSourceAllowsHttpsTarget(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	}))
	defer server.Close()

	target, err := url.Parse(server.URL)
	if err != nil {
		t.Fatalf("parse server url: %v", err)
	}
	cspSource := "http://" + target.Host
	resp := NewApp().SendRequest(model.HttpRequest{
		Method:                http.MethodGet,
		URL:                   server.URL,
		BrowserOrigin:         "https://app.example.com",
		BrowserEnforceCSP:     true,
		BrowserCSP:            fmt.Sprintf("connect-src %s", cspSource),
		FollowRedirects:       true,
		TimeoutMs:             5000,
		HTTPVersion:           "auto",
		EnableSSLVerification: true,
		MaxRedirects:          10,
	})
	if resp.Error != "" && strings.Contains(resp.Error, "CSP error") {
		t.Fatalf("CSP source with http scheme should match http or https target, got %q", resp.Error)
	}
}
