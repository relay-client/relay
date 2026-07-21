package api

import (
	"bytes"
	"context"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/relay-client/relay/apps/desktop/internal/model"
)

func header(key, value string) model.KeyValue {
	return model.KeyValue{Key: key, Value: value, Enabled: true}
}

func TestDownloadFilenamePrefersContentDisposition(t *testing.T) {
	headers := []model.KeyValue{
		header("Content-Type", "application/json"),
		header("Content-Disposition", `attachment; filename="report.pdf"`),
	}
	if got := downloadFilename("products", headers); got != "report.pdf" {
		t.Fatalf("expected report.pdf, got %q", got)
	}
}

func TestDownloadFilenameStripsPathFromContentDisposition(t *testing.T) {
	headers := []model.KeyValue{header("Content-Disposition", `attachment; filename="/etc/passwd"`)}
	if got := downloadFilename("x", headers); got != "passwd" {
		t.Fatalf("expected passwd, got %q", got)
	}
}

func TestDownloadFilenameAppendsExtensionFromContentType(t *testing.T) {
	cases := map[string]string{
		"application/json":                "products.json",
		"application/json; charset=utf-8": "products.json",
		"image/png":                       "products.png",
		"application/pdf":                 "products.pdf",
		"application/octet-stream":        "products.bin",
	}
	for contentType, want := range cases {
		got := downloadFilename("products", []model.KeyValue{header("Content-Type", contentType)})
		if got != want {
			t.Fatalf("content-type %q: expected %q, got %q", contentType, want, got)
		}
	}
}

func TestDownloadFilenameKeepsExistingExtension(t *testing.T) {
	headers := []model.KeyValue{header("Content-Type", "application/json")}
	if got := downloadFilename("data.csv", headers); got != "data.csv" {
		t.Fatalf("expected data.csv, got %q", got)
	}
}

func TestDownloadFilenameFallsBackToResponse(t *testing.T) {
	if got := downloadFilename("", []model.KeyValue{header("Content-Type", "application/json")}); got != "response.json" {
		t.Fatalf("expected response.json, got %q", got)
	}
	if got := downloadFilename("  ", nil); got != "response" {
		t.Fatalf("expected response, got %q", got)
	}
}

func TestCopyResponseBodyStreamsFullBodyAndBoundsPreview(t *testing.T) {
	payload := bytes.Repeat([]byte("0123456789"), 1024)
	var preview bytes.Buffer
	var saved bytes.Buffer

	size, truncated, err := copyResponseBody(&preview, &saved, bytes.NewReader(payload), 128)
	if err != nil {
		t.Fatalf("copy response: %v", err)
	}
	if size != int64(len(payload)) {
		t.Fatalf("size = %d, want %d", size, len(payload))
	}
	if !truncated {
		t.Fatal("expected bounded preview to be marked truncated")
	}
	if preview.Len() != 128 {
		t.Fatalf("preview length = %d, want 128", preview.Len())
	}
	if !bytes.Equal(saved.Bytes(), payload) {
		t.Fatal("saved body did not contain the complete response")
	}
}

func TestCopyResponseBodyReturnsStreamErrors(t *testing.T) {
	streamErr := errors.New("stream interrupted")
	reader := io.MultiReader(
		bytes.NewReader([]byte("partial")),
		errorReader{err: streamErr},
	)
	var preview bytes.Buffer
	var saved bytes.Buffer

	_, _, err := copyResponseBody(&preview, &saved, reader, 128)
	if !errors.Is(err, streamErr) {
		t.Fatalf("copy error = %v, want %v", err, streamErr)
	}
}

func TestDoRequestWithBodySinkStreamsCompleteResponse(t *testing.T) {
	payload := bytes.Repeat([]byte("download-body-"), 128)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write(payload)
	}))
	defer server.Close()

	previousLimit := maxResponseBodySize
	maxResponseBodySize = 128
	t.Cleanup(func() {
		maxResponseBodySize = previousLimit
	})

	var saved bytes.Buffer
	committed := false
	aborted := false
	resp := doRequestWithBodySink(
		context.Background(),
		model.HttpRequest{
			Method:                http.MethodGet,
			URL:                   server.URL,
			EnableSSLVerification: true,
			FollowRedirects:       true,
		},
		nil,
		newPreflightCache(),
		func([]model.KeyValue) *responseBodySink {
			return &responseBodySink{
				writer: &saved,
				commit: func() error {
					committed = true
					return nil
				},
				abort: func() {
					aborted = true
				},
			}
		},
	)

	if !committed || aborted {
		t.Fatalf("download commit=%v abort=%v", committed, aborted)
	}
	if !bytes.Equal(saved.Bytes(), payload) {
		t.Fatalf("saved %d bytes, want %d", saved.Len(), len(payload))
	}
	if len(resp.Body) != int(maxResponseBodySize) {
		t.Fatalf("preview length = %d, want %d", len(resp.Body), maxResponseBodySize)
	}
	if resp.Size != int64(len(payload)) {
		t.Fatalf("response size = %d, want %d", resp.Size, len(payload))
	}
	if !strings.Contains(resp.Error, "response truncated") {
		t.Fatalf("expected bounded viewer warning, got %q", resp.Error)
	}
}

func TestDoRequestWithBodySinkReportsCommitFailure(t *testing.T) {
	payload := bytes.Repeat([]byte("download-body-"), 128)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write(payload)
	}))
	defer server.Close()

	previousLimit := maxResponseBodySize
	maxResponseBodySize = 128
	t.Cleanup(func() {
		maxResponseBodySize = previousLimit
	})

	commitErr := errors.New("disk full")
	aborted := false
	resp := doRequestWithBodySink(
		context.Background(),
		model.HttpRequest{
			Method:                http.MethodGet,
			URL:                   server.URL,
			EnableSSLVerification: true,
			FollowRedirects:       true,
		},
		nil,
		newPreflightCache(),
		func([]model.KeyValue) *responseBodySink {
			return &responseBodySink{
				writer: io.Discard,
				commit: func() error {
					return commitErr
				},
				abort: func() {
					aborted = true
				},
			}
		},
	)

	if !aborted {
		t.Fatal("failed download was not aborted")
	}
	if !strings.Contains(resp.Error, commitErr.Error()) {
		t.Fatalf("response error %q does not report commit failure", resp.Error)
	}
}

func TestResponseDownloadSinkCommitsCompleteFile(t *testing.T) {
	path := filepath.Join(t.TempDir(), "response.bin")
	committedPath := ""
	sink, err := newResponseDownloadSink(path, func() {
		committedPath = path
	})
	if err != nil {
		t.Fatalf("create sink: %v", err)
	}
	payload := bytes.Repeat([]byte{0, 1, 2, 3, 255}, 128)
	if _, err := sink.writer.Write(payload); err != nil {
		t.Fatalf("write sink: %v", err)
	}
	if err := sink.commit(); err != nil {
		t.Fatalf("commit sink: %v", err)
	}

	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read committed file: %v", err)
	}
	if !bytes.Equal(data, payload) {
		t.Fatal("committed file did not preserve the complete binary payload")
	}
	if committedPath != path {
		t.Fatalf("commit callback path = %q, want %q", committedPath, path)
	}
}

func TestResponseDownloadSinkAbortLeavesDestinationUntouched(t *testing.T) {
	path := filepath.Join(t.TempDir(), "response.bin")
	original := []byte("original")
	if err := os.WriteFile(path, original, 0600); err != nil {
		t.Fatalf("seed destination: %v", err)
	}
	sink, err := newResponseDownloadSink(path, nil)
	if err != nil {
		t.Fatalf("create sink: %v", err)
	}
	if _, err := sink.writer.Write([]byte("partial")); err != nil {
		t.Fatalf("write sink: %v", err)
	}
	sink.abort()

	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read destination: %v", err)
	}
	if !bytes.Equal(data, original) {
		t.Fatalf("abort changed destination: %q", data)
	}
}

type errorReader struct {
	err error
}

func (r errorReader) Read([]byte) (int, error) {
	return 0, r.err
}
