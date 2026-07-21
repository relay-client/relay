package api

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"

	"github.com/relay-client/relay/apps/desktop/internal/model"
)

func TestSendRequestBrowserEmulationAddsBrowserHeaders(t *testing.T) {
	var gotOrigin string
	var gotFetchMode string
	var gotFetchSite string
	var gotUserAgent string

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotOrigin = r.Header.Get("Origin")
		gotFetchMode = r.Header.Get("Sec-Fetch-Mode")
		gotFetchSite = r.Header.Get("Sec-Fetch-Site")
		gotUserAgent = r.Header.Get("User-Agent")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	}))
	defer server.Close()

	resp := NewApp().SendRequest(model.HttpRequest{
		Method:                http.MethodGet,
		URL:                   server.URL,
		BrowserEmulation:      true,
		BrowserOrigin:         "https://app.example.com/dashboard",
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
		t.Fatalf("expected normalized browser Origin, got %q", gotOrigin)
	}
	if gotFetchMode != "cors" || gotFetchSite != "cross-site" {
		t.Fatalf("expected browser fetch metadata, got mode=%q site=%q", gotFetchMode, gotFetchSite)
	}
	if !strings.HasPrefix(gotUserAgent, "Mozilla/5.0 ") {
		t.Fatalf("expected browser-like user agent, got %q", gotUserAgent)
	}
}

func TestSendRequestCORSPreflightBlocksActualRequest(t *testing.T) {
	var optionsCount atomic.Int32
	var actualCount atomic.Int32

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodOptions {
			optionsCount.Add(1)
			w.WriteHeader(http.StatusNoContent)
			return
		}
		actualCount.Add(1)
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("should-not-run"))
	}))
	defer server.Close()

	resp := NewApp().SendRequest(model.HttpRequest{
		Method:        http.MethodPost,
		URL:           server.URL,
		BodyType:      "json",
		Body:          `{"ok":true}`,
		BrowserOrigin: "https://app.example.com",
		Headers: []model.KeyValue{
			{Enabled: true, Key: "X-Token", Value: "secret"},
		},
		BrowserEnforceCORS:    true,
		FollowRedirects:       true,
		TimeoutMs:             5000,
		HTTPVersion:           "auto",
		EnableSSLVerification: true,
		MaxRedirects:          10,
	})

	if !strings.Contains(resp.Error, "CORS error: preflight response is missing Access-Control-Allow-Origin") {
		t.Fatalf("expected preflight CORS error, got %q", resp.Error)
	}
	if optionsCount.Load() != 1 {
		t.Fatalf("expected one OPTIONS preflight, got %d", optionsCount.Load())
	}
	if actualCount.Load() != 0 {
		t.Fatalf("expected actual request to be blocked, got %d", actualCount.Load())
	}
}

func TestSendRequestBrowserEmulationOmitsCrossOriginCookieWithoutCredentials(t *testing.T) {
	var gotCookie string

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotCookie = r.Header.Get("Cookie")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	}))
	defer server.Close()

	resp := NewApp().SendRequest(model.HttpRequest{
		Method:           http.MethodGet,
		URL:              server.URL,
		BrowserEmulation: true,
		BrowserOrigin:    "https://app.example.com",
		Headers: []model.KeyValue{
			{Enabled: true, Key: "Cookie", Value: "session=secret"},
		},
		FollowRedirects:       true,
		TimeoutMs:             5000,
		HTTPVersion:           "auto",
		EnableSSLVerification: true,
		MaxRedirects:          10,
	})

	if resp.Error != "" {
		t.Fatalf("unexpected response error: %s", resp.Error)
	}
	if gotCookie != "" {
		t.Fatalf("expected cross-origin browser request without credentials to omit Cookie, got %q", gotCookie)
	}
}

func TestSendRequestCORSPreflightAllowsCredentialedRequest(t *testing.T) {
	var sawPreflight bool
	var sawActual bool

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodOptions {
			sawPreflight = true
			if got := r.Header.Get("Origin"); got != "https://app.example.com" {
				t.Fatalf("expected preflight Origin, got %q", got)
			}
			if got := r.Header.Get("Access-Control-Request-Method"); got != http.MethodPost {
				t.Fatalf("expected preflight method POST, got %q", got)
			}
			gotHeaders := r.Header.Get("Access-Control-Request-Headers")
			if !strings.Contains(gotHeaders, "content-type") || !strings.Contains(gotHeaders, "x-token") {
				t.Fatalf("expected preflight request headers to include content-type and x-token, got %q", gotHeaders)
			}
			w.Header().Set("Access-Control-Allow-Origin", "https://app.example.com")
			w.Header().Set("Access-Control-Allow-Methods", "POST")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, X-Token")
			w.Header().Set("Access-Control-Allow-Credentials", "true")
			w.WriteHeader(http.StatusNoContent)
			return
		}

		sawActual = true
		body, err := io.ReadAll(r.Body)
		if err != nil {
			t.Fatalf("read body: %v", err)
		}
		if string(body) != `{"ok":true}` {
			t.Fatalf("expected body to reach actual request, got %q", string(body))
		}
		w.Header().Set("Access-Control-Allow-Origin", "https://app.example.com")
		w.Header().Set("Access-Control-Allow-Credentials", "true")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	}))
	defer server.Close()

	resp := NewApp().SendRequest(model.HttpRequest{
		Method:        http.MethodPost,
		URL:           server.URL,
		BodyType:      "json",
		Body:          `{"ok":true}`,
		BrowserOrigin: "https://app.example.com",
		Headers: []model.KeyValue{
			{Enabled: true, Key: "X-Token", Value: "secret"},
		},
		BrowserWithCredentials: true,
		BrowserEnforceCORS:     true,
		FollowRedirects:        true,
		TimeoutMs:              5000,
		HTTPVersion:            "auto",
		EnableSSLVerification:  true,
		MaxRedirects:           10,
	})

	if resp.Error != "" {
		t.Fatalf("unexpected response error: %s", resp.Error)
	}
	if !sawPreflight || !sawActual {
		t.Fatalf("expected both preflight and actual request, got preflight=%v actual=%v", sawPreflight, sawActual)
	}
	if resp.Body != "ok" {
		t.Fatalf("expected response body, got %q", resp.Body)
	}
}

func TestSendRequestCORSBlocksActualResponseWithoutExposeOrigin(t *testing.T) {
	var actualCount atomic.Int32

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		actualCount.Add(1)
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("hidden"))
	}))
	defer server.Close()

	resp := NewApp().SendRequest(model.HttpRequest{
		Method:                http.MethodGet,
		URL:                   server.URL,
		BrowserOrigin:         "https://app.example.com",
		BrowserEnforceCORS:    true,
		FollowRedirects:       true,
		TimeoutMs:             5000,
		HTTPVersion:           "auto",
		EnableSSLVerification: true,
		MaxRedirects:          10,
	})

	if !strings.Contains(resp.Error, "CORS error: response is missing Access-Control-Allow-Origin") {
		t.Fatalf("expected actual response CORS error, got %q", resp.Error)
	}
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected blocked response status to be preserved, got %d", resp.StatusCode)
	}
	if resp.Body != "" {
		t.Fatalf("expected blocked browser response body to be hidden, got %q", resp.Body)
	}
	if actualCount.Load() != 1 {
		t.Fatalf("expected actual request to be sent once, got %d", actualCount.Load())
	}
}

func TestSendRequestCSPBlocksBeforeNetwork(t *testing.T) {
	var actualCount atomic.Int32

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		actualCount.Add(1)
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	resp := NewApp().SendRequest(model.HttpRequest{
		Method:                http.MethodGet,
		URL:                   server.URL,
		BrowserOrigin:         "https://app.example.com",
		BrowserEnforceCSP:     true,
		BrowserCSP:            "default-src 'self'; connect-src https://api.example.com",
		FollowRedirects:       true,
		TimeoutMs:             5000,
		HTTPVersion:           "auto",
		EnableSSLVerification: true,
		MaxRedirects:          10,
	})

	if !strings.Contains(resp.Error, "CSP error: request to") {
		t.Fatalf("expected CSP error, got %q", resp.Error)
	}
	if actualCount.Load() != 0 {
		t.Fatalf("expected CSP to block before network, got %d requests", actualCount.Load())
	}
}

func TestSendRequestCSPAllowsSelfOrigin(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	}))
	defer server.Close()

	resp := NewApp().SendRequest(model.HttpRequest{
		Method:                http.MethodGet,
		URL:                   server.URL,
		BrowserOrigin:         server.URL,
		BrowserEnforceCSP:     true,
		BrowserCSP:            "connect-src 'self'",
		FollowRedirects:       true,
		TimeoutMs:             5000,
		HTTPVersion:           "auto",
		EnableSSLVerification: true,
		MaxRedirects:          10,
	})

	if resp.Error != "" {
		t.Fatalf("unexpected response error: %s", resp.Error)
	}
	if resp.Body != "ok" {
		t.Fatalf("expected response body, got %q", resp.Body)
	}
}
