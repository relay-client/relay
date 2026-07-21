package api

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/andybalholm/brotli"
	"github.com/klauspost/compress/zstd"
	"github.com/relay-client/relay/apps/desktop/internal/model"
)

// When the request carries an explicit Accept-Encoding, Go's transport stops
// auto-decompressing, so a br/zstd response would otherwise reach the viewer as
// raw compressed bytes. These end-to-end tests exercise the real request path
// and assert the body comes back readable.
func TestSendRequestDecodesBrotli(t *testing.T) {
	const payload = `{"error":"unauthorized"}`
	var compressed bytes.Buffer
	bw := brotli.NewWriter(&compressed)
	if _, err := bw.Write([]byte(payload)); err != nil {
		t.Fatal(err)
	}
	if err := bw.Close(); err != nil {
		t.Fatal(err)
	}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Encoding", "br")
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnauthorized)
		_, _ = w.Write(compressed.Bytes())
	}))
	defer server.Close()

	req := defaultBrowserReq(server.URL)
	// Mirror the real-world curl: the client explicitly asks for br.
	req.Headers = []model.KeyValue{{Enabled: true, Key: "Accept-Encoding", Value: "gzip, deflate, br, zstd"}}

	resp := NewApp().SendRequest(req)
	if resp.Body != payload {
		t.Fatalf("brotli body not decoded: got %q, want %q", resp.Body, payload)
	}
	if resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", resp.StatusCode)
	}
}

func TestSendRequestDecodesZstd(t *testing.T) {
	const payload = `{"ok":true,"data":[1,2,3]}`
	var compressed bytes.Buffer
	zw, err := zstd.NewWriter(&compressed)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := zw.Write([]byte(payload)); err != nil {
		t.Fatal(err)
	}
	if err := zw.Close(); err != nil {
		t.Fatal(err)
	}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Encoding", "zstd")
		_, _ = w.Write(compressed.Bytes())
	}))
	defer server.Close()

	req := defaultBrowserReq(server.URL)
	req.Headers = []model.KeyValue{{Enabled: true, Key: "Accept-Encoding", Value: "zstd"}}

	resp := NewApp().SendRequest(req)
	if resp.Body != payload {
		t.Fatalf("zstd body not decoded: got %q, want %q", resp.Body, payload)
	}
}
