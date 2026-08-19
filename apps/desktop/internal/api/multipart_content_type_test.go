package api

import (
	"io"
	"mime"
	"mime/multipart"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/relay-client/relay/apps/desktop/internal/model"
)

// sentPart is one decoded multipart part. The body is captured as the part is
// read, because advancing the reader invalidates the previous part.
type sentPart struct {
	contentType string
	fileName    string
	body        string
}

// readParts runs the multipart body the sender would produce back through a
// reader, so the assertions are about what a server actually receives.
func readParts(t *testing.T, rows []model.KeyValue) map[string]sentPart {
	t.Helper()
	body, contentType, err := buildMultipartBody(rows)
	if err != nil {
		t.Fatalf("buildMultipartBody: %v", err)
	}
	_, params, err := mime.ParseMediaType(contentType)
	if err != nil {
		t.Fatalf("parse content type %q: %v", contentType, err)
	}
	reader := multipart.NewReader(body, params["boundary"])
	parts := map[string]sentPart{}
	for {
		part, err := reader.NextPart()
		if err == io.EOF {
			break
		}
		if err != nil {
			t.Fatalf("next part: %v", err)
		}
		raw, err := io.ReadAll(part)
		if err != nil {
			t.Fatalf("read part %q: %v", part.FormName(), err)
		}
		parts[part.FormName()] = sentPart{
			contentType: part.Header.Get("Content-Type"),
			fileName:    part.FileName(),
			body:        string(raw),
		}
	}
	return parts
}

// TestMultipartFilePartUsesConfiguredContentType is the upload case: an API
// that only accepts image/png rejected every upload, because the part was
// always labelled application/octet-stream.
func TestMultipartFilePartUsesConfiguredContentType(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "avatar.png")
	if err := os.WriteFile(path, []byte("not really a png"), 0600); err != nil {
		t.Fatalf("write fixture: %v", err)
	}

	parts := readParts(t, []model.KeyValue{
		{Key: "avatar", Value: path, Enabled: true, IsFile: true, FileName: "avatar.png", ContentType: "image/png"},
	})
	part, ok := parts["avatar"]
	if !ok {
		t.Fatal("no avatar part was sent")
	}
	if part.contentType != "image/png" {
		t.Errorf("Content-Type = %q, want image/png", part.contentType)
	}
	if part.fileName != "avatar.png" {
		t.Errorf("filename = %q, want avatar.png", part.fileName)
	}
	if part.body != "not really a png" {
		t.Errorf("part body = %q, want the file contents", part.body)
	}
}

// TestMultipartFilePartDefaultsToOctetStream pins the untouched behaviour: a
// row that names no type keeps what Relay always sent.
func TestMultipartFilePartDefaultsToOctetStream(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "data.bin")
	if err := os.WriteFile(path, []byte("bytes"), 0600); err != nil {
		t.Fatalf("write fixture: %v", err)
	}

	parts := readParts(t, []model.KeyValue{
		{Key: "blob", Value: path, Enabled: true, IsFile: true},
	})
	part, ok := parts["blob"]
	if !ok {
		t.Fatal("no blob part was sent")
	}
	if part.contentType != "application/octet-stream" {
		t.Errorf("Content-Type = %q, want application/octet-stream", part.contentType)
	}
}

// TestMultipartTextPartCanCarryContentType covers the other common shape: a
// JSON part sitting next to a file in the same multipart body.
func TestMultipartTextPartCanCarryContentType(t *testing.T) {
	parts := readParts(t, []model.KeyValue{
		{Key: "meta", Value: `{"a":1}`, Enabled: true, ContentType: "application/json"},
		{Key: "plain", Value: "hello", Enabled: true},
	})

	meta, ok := parts["meta"]
	if !ok {
		t.Fatal("no meta part was sent")
	}
	if meta.contentType != "application/json" {
		t.Errorf("meta Content-Type = %q, want application/json", meta.contentType)
	}
	if meta.body != `{"a":1}` {
		t.Errorf("meta body = %q", meta.body)
	}

	plain, ok := parts["plain"]
	if !ok {
		t.Fatal("no plain part was sent")
	}
	if plain.contentType != "" {
		t.Errorf("a row naming no type must not gain one, got %q", plain.contentType)
	}
}

// TestMultipartPartNameIsEscaped keeps a quote in a field name from breaking
// out of the Content-Disposition header.
func TestMultipartPartNameIsEscaped(t *testing.T) {
	parts := readParts(t, []model.KeyValue{
		{Key: `od"d`, Value: "v", Enabled: true, ContentType: "text/plain"},
	})
	if _, ok := parts[`od"d`]; !ok {
		names := make([]string, 0, len(parts))
		for name := range parts {
			names = append(names, name)
		}
		t.Fatalf("field name did not survive escaping, got parts: %s", strings.Join(names, ", "))
	}
}
