package api

import (
	"bytes"
	"compress/gzip"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/relay-client/relay/apps/desktop/internal/api/auth"
	"github.com/relay-client/relay/apps/desktop/internal/api/state"
	"github.com/relay-client/relay/apps/desktop/internal/model"
)

// TestEmptyRawBodyStillSendsContentType covers the 415 case: choosing JSON and
// sending nothing dropped the header entirely, so servers that validate
// Content-Type before they look at the body rejected the request.
func TestEmptyRawBodyStillSendsContentType(t *testing.T) {
	for _, tc := range []struct{ bodyType, want string }{
		{"json", "application/json"},
		{"xml", "application/xml"},
		{"text", "text/plain"},
	} {
		t.Run(tc.bodyType, func(t *testing.T) {
			var got string
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				got = r.Header.Get("Content-Type")
			}))
			defer server.Close()

			resp := sendRequest(t.Context(), model.HttpRequest{
				Method: http.MethodPost, URL: server.URL,
				BodyType: tc.bodyType, Body: "",
				EnableSSLVerification: true,
			}, state.New(), newCookieJarRegistry(), newPreflightCache())
			if resp.Error != "" {
				t.Fatalf("send: %s", resp.Error)
			}
			if got != tc.want {
				t.Errorf("Content-Type = %q, want %q", got, tc.want)
			}
		})
	}
}

// TestBodyTypeNoneSendsNoContentType is the other half: the default body type
// must not start labelling every GET.
func TestBodyTypeNoneSendsNoContentType(t *testing.T) {
	var got string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		got = r.Header.Get("Content-Type")
	}))
	defer server.Close()

	resp := sendRequest(t.Context(), model.HttpRequest{
		Method: http.MethodGet, URL: server.URL, BodyType: "none",
		EnableSSLVerification: true,
	}, state.New(), newCookieJarRegistry(), newPreflightCache())
	if resp.Error != "" {
		t.Fatalf("send: %s", resp.Error)
	}
	if got != "" {
		t.Errorf("Content-Type = %q, want none", got)
	}
}

// TestDigestAuthWithoutUsernameFails guards the silent no-op: the digest
// transport is only wired up when there is a username, so the request used to
// go out unauthenticated and come back 401 with nothing to explain it.
func TestDigestAuthWithoutUsernameFails(t *testing.T) {
	err := auth.Apply(httptest.NewRequest(http.MethodGet, "https://example.com/", nil), model.AuthConfig{Type: "digest"})
	if err == nil {
		t.Fatal("digest auth with no username must be an error, not a silent unauthenticated send")
	}
	if !strings.Contains(err.Error(), "username") {
		t.Errorf("error should name the missing field, got: %v", err)
	}
}

// TestDownloadDecompressesBody covers Send-and-Download: with an explicit
// Accept-Encoding Go stops decompressing, and the gzip stream was written to
// disk under a name like report.json.
func TestDownloadDecompressesBody(t *testing.T) {
	const payload = `{"report":"readable"}`
	var compressed bytes.Buffer
	zw := gzip.NewWriter(&compressed)
	if _, err := zw.Write([]byte(payload)); err != nil {
		t.Fatalf("gzip write: %v", err)
	}
	if err := zw.Close(); err != nil {
		t.Fatalf("gzip close: %v", err)
	}

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Encoding", "gzip")
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write(compressed.Bytes())
	}))
	defer server.Close()

	var saved bytes.Buffer
	resp := sendRequestWithBodySink(t.Context(), model.HttpRequest{
		Method: http.MethodGet, URL: server.URL,
		// Asking for the encoding explicitly is what disables Go's own handling.
		Headers:               []model.KeyValue{{Key: "Accept-Encoding", Value: "gzip", Enabled: true}},
		EnableSSLVerification: true,
	}, state.New(), newCookieJarRegistry(), newPreflightCache(),
		func([]model.KeyValue) *responseBodySink {
			return &responseBodySink{writer: &saved, commit: func() error { return nil }}
		})

	if resp.Error != "" {
		t.Fatalf("send: %s", resp.Error)
	}
	if saved.String() != payload {
		t.Errorf("saved file = %q, want the decompressed payload %q", saved.String(), payload)
	}
}

// TestDownloadLeavesUnknownEncodingIntact makes sure the fallback is whole: an
// encoding Relay cannot undo must still reach the file byte for byte.
func TestDownloadLeavesUnknownEncodingIntact(t *testing.T) {
	const raw = "opaque-bytes-abcdef"
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Encoding", "made-up")
		_, _ = w.Write([]byte(raw))
	}))
	defer server.Close()

	var saved bytes.Buffer
	resp := sendRequestWithBodySink(t.Context(), model.HttpRequest{
		Method: http.MethodGet, URL: server.URL,
		Headers:               []model.KeyValue{{Key: "Accept-Encoding", Value: "made-up", Enabled: true}},
		EnableSSLVerification: true,
	}, state.New(), newCookieJarRegistry(), newPreflightCache(),
		func([]model.KeyValue) *responseBodySink {
			return &responseBodySink{writer: &saved, commit: func() error { return nil }}
		})

	if resp.Error != "" {
		t.Fatalf("send: %s", resp.Error)
	}
	if saved.String() != raw {
		t.Errorf("saved file = %q, want the raw bytes %q", saved.String(), raw)
	}
}

// TestDownloadRewindsAfterFailedDecode is the nastier fallback: the encoding is
// one Relay knows, but the stream is not actually valid. Nothing may be lost to
// the constructor that already read part of it.
func TestDownloadRewindsAfterFailedDecode(t *testing.T) {
	const raw = "this is not gzip at all"
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Encoding", "gzip")
		_, _ = w.Write([]byte(raw))
	}))
	defer server.Close()

	var saved bytes.Buffer
	resp := sendRequestWithBodySink(t.Context(), model.HttpRequest{
		Method: http.MethodGet, URL: server.URL,
		Headers:               []model.KeyValue{{Key: "Accept-Encoding", Value: "gzip", Enabled: true}},
		EnableSSLVerification: true,
	}, state.New(), newCookieJarRegistry(), newPreflightCache(),
		func([]model.KeyValue) *responseBodySink {
			return &responseBodySink{writer: &saved, commit: func() error { return nil }}
		})

	if resp.Error != "" {
		t.Fatalf("send: %s", resp.Error)
	}
	if saved.String() != raw {
		t.Errorf("saved file = %q, want the untouched bytes %q", saved.String(), raw)
	}
}
