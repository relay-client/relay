package api

import (
	"bytes"
	"encoding/base64"
	"image"
	"image/color"
	"image/png"
	"strings"
	"testing"

	"github.com/relay-client/relay/apps/desktop/internal/model"
)

func pngBytes(t *testing.T) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, 4, 4))
	img.Set(1, 1, color.RGBA{R: 200, G: 30, B: 90, A: 255})
	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		t.Fatal(err)
	}
	return buf.Bytes()
}

func ctHeaders(value string) []model.KeyValue {
	return []model.KeyValue{{Key: "Content-Type", Value: value}}
}

func TestBuildPreviewImagePNG(t *testing.T) {
	raw := pngBytes(t)
	data, mediaType := buildPreviewImage(raw, ctHeaders("image/png"), false)
	if mediaType != "image/png" {
		t.Fatalf("mediaType = %q", mediaType)
	}
	decoded, err := base64.StdEncoding.DecodeString(data)
	if err != nil {
		t.Fatalf("not valid base64: %v", err)
	}
	if !bytes.Equal(decoded, raw) {
		t.Error("preview data must round-trip the exact bytes")
	}
}

// The whole reason this path exists: Body is a Go string on the wire, and any
// non-UTF-8 byte is replaced when it is JSON-encoded for the frontend.
func TestBuildPreviewImageSurvivesWhereBodyStringDoesNot(t *testing.T) {
	raw := pngBytes(t)
	viaBodyString := []byte(string(raw))
	if !bytes.Equal(viaBodyString, raw) {
		t.Skip("string round-trip already differs on this platform")
	}
	data, _ := buildPreviewImage(raw, ctHeaders("image/png"), false)
	decoded, _ := base64.StdEncoding.DecodeString(data)
	if !bytes.Equal(decoded, raw) {
		t.Error("base64 channel must be byte-exact")
	}
	if !bytes.Contains(raw, []byte{0x89, 0x50, 0x4E, 0x47}) {
		t.Error("expected a PNG signature in the fixture")
	}
}

func TestBuildPreviewImageHonorsContentTypeParameters(t *testing.T) {
	raw := pngBytes(t)
	if _, mediaType := buildPreviewImage(raw, ctHeaders("image/png; charset=binary"), false); mediaType != "image/png" {
		t.Errorf("mediaType = %q, want image/png", mediaType)
	}
}

func TestBuildPreviewImageSniffsWhenContentTypeIsUseless(t *testing.T) {
	raw := pngBytes(t)
	data, mediaType := buildPreviewImage(raw, ctHeaders("application/octet-stream"), false)
	if mediaType != "image/png" {
		t.Errorf("an image served as octet-stream should still be sniffed, got %q", mediaType)
	}
	if data == "" {
		t.Error("expected preview data")
	}
}

func TestBuildPreviewImageSVG(t *testing.T) {
	svg := []byte(`<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>`)
	data, mediaType := buildPreviewImage(svg, ctHeaders("image/svg+xml"), false)
	if mediaType != "image/svg+xml" || data == "" {
		t.Errorf("svg should be previewable, got %q", mediaType)
	}
}

func TestBuildPreviewImageSkipsNonImages(t *testing.T) {
	cases := []struct {
		name        string
		body        []byte
		contentType string
	}{
		{"json", []byte(`{"a":1}`), "application/json"},
		{"html", []byte("<html><body>hi</body></html>"), "text/html"},
		{"empty", nil, "image/png"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if data, mediaType := buildPreviewImage(tc.body, ctHeaders(tc.contentType), false); data != "" || mediaType != "" {
				t.Errorf("expected no preview, got %q (%d bytes)", mediaType, len(data))
			}
		})
	}
}

// A truncated image is a partial file that no decoder will render, and the
// base64 of it would just waste memory.
func TestBuildPreviewImageSkipsTruncated(t *testing.T) {
	if data, _ := buildPreviewImage(pngBytes(t), ctHeaders("image/png"), true); data != "" {
		t.Error("a truncated body must not produce a preview")
	}
}

func TestBuildPreviewImageSkipsOversized(t *testing.T) {
	huge := make([]byte, maxPreviewImageBytes+1)
	copy(huge, pngBytes(t))
	if data, _ := buildPreviewImage(huge, ctHeaders("image/png"), false); data != "" {
		t.Errorf("a body over the %d MB cap must not be inlined", maxPreviewImageBytes/(1024*1024))
	}
}

func TestResponseMediaType(t *testing.T) {
	if got := responseMediaType(ctHeaders("Text/HTML; charset=UTF-8")); got != "text/html" {
		t.Errorf("got %q, want text/html", got)
	}
	if got := responseMediaType(nil); got != "" {
		t.Errorf("got %q, want empty", got)
	}
	// A malformed Content-Type should still yield the leading type.
	if got := responseMediaType(ctHeaders("application/json;;;")); !strings.HasPrefix(got, "application/json") {
		t.Errorf("got %q", got)
	}
}

func TestClassifyResponseBodyText(t *testing.T) {
	cases := []struct {
		name        string
		body        string
		contentType string
	}{
		{"json", `{"a":1}`, "application/json"},
		{"html", "<html><body>hi</body></html>", "text/html; charset=utf-8"},
		{"plain", "hello world", "text/plain"},
		{"utf8 cyrillic", "привет мир", "text/plain; charset=utf-8"},
		{"emoji", "ok 🎉", "application/json"},
		{"vendor json suffix", `{"a":1}`, "application/vnd.api+json"},
		{"atom xml suffix", "<feed/>", "application/atom+xml"},
		{"svg is text", `<svg xmlns="http://www.w3.org/2000/svg"/>`, "image/svg+xml"},
		{"no content type", "just text", ""},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			isBinary, _ := classifyResponseBody([]byte(tc.body), ctHeaders(tc.contentType))
			if isBinary {
				t.Errorf("%q (%s) should be treated as text", tc.body, tc.contentType)
			}
		})
	}
}

func TestClassifyResponseBodyBinary(t *testing.T) {
	png := pngBytes(t)
	cases := []struct {
		name        string
		body        []byte
		contentType string
	}{
		{"png", png, "image/png"},
		{"invalid utf8", []byte{0xff, 0xfe, 0x01, 0x02, 0x03}, "application/octet-stream"},
		{"nul byte in otherwise valid utf8", []byte("text\x00more"), "text/plain"},
		{"pdf", append([]byte("%PDF-1.4\n"), 0x80, 0x81), "application/pdf"},
		{"zip", []byte{0x50, 0x4b, 0x03, 0x04, 0xff, 0x00}, "application/zip"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			isBinary, _ := classifyResponseBody(tc.body, ctHeaders(tc.contentType))
			if !isBinary {
				t.Errorf("%s should be detected as binary", tc.name)
			}
		})
	}
}

// The case from the wild that produced a screen of replacement characters: a
// server labels a binary payload text/html. The declared type must not win over
// the actual bytes.
func TestClassifyResponseBodyMislabelledBinary(t *testing.T) {
	isBinary, sniffed := classifyResponseBody(pngBytes(t), ctHeaders("text/html"))
	if !isBinary {
		t.Error("binary mislabelled as text/html must still be detected as binary")
	}
	if sniffed != "image/png" {
		t.Errorf("sniffed = %q, want image/png so the viewer can say what it really is", sniffed)
	}
}

func TestClassifyResponseBodyEmpty(t *testing.T) {
	if isBinary, _ := classifyResponseBody(nil, ctHeaders("application/octet-stream")); isBinary {
		t.Error("an empty body is not binary")
	}
}

// A UTF-8 body with no declared type and an octet-stream sniff is still text —
// DetectContentType says octet-stream for plenty of harmless payloads.
func TestClassifyResponseBodyUndeclaredUTF8(t *testing.T) {
	if isBinary, _ := classifyResponseBody([]byte("id,name\n1,ada\n"), nil); isBinary {
		t.Error("undeclared valid UTF-8 should be treated as text")
	}
}

func TestIsTextualMediaType(t *testing.T) {
	textual := []string{"text/plain", "text/csv", "application/json", "application/xml", "application/problem+json", "application/vnd.api+json", "image/svg+xml"}
	for _, mt := range textual {
		if !isTextualMediaType(mt) {
			t.Errorf("%s should be textual", mt)
		}
	}
	binary := []string{"", "image/png", "application/pdf", "application/zip", "font/woff2", "application/octet-stream"}
	for _, mt := range binary {
		if isTextualMediaType(mt) {
			t.Errorf("%s should not be textual", mt)
		}
	}
}
