package api

import (
	"bytes"
	"encoding/base64"
	"mime"
	"net/http"
	"strings"
	"unicode/utf8"

	"github.com/relay-client/relay/apps/desktop/internal/model"
)

const maxPreviewImageBytes = 16 * 1024 * 1024

var previewableImageTypes = map[string]struct{}{
	"image/png":                {},
	"image/jpeg":               {},
	"image/gif":                {},
	"image/webp":               {},
	"image/bmp":                {},
	"image/avif":               {},
	"image/svg+xml":            {},
	"image/x-icon":             {},
	"image/vnd.microsoft.icon": {},
}

// classifyResponseBody reports whether a body is binary, and what it looks
// like. It runs on the real bytes: by the time the body reaches the interface
// it is a JSON string, where every invalid UTF-8 sequence has already been
// replaced, so the distinction cannot be recovered there.
func classifyResponseBody(bodyBytes []byte, headers []model.KeyValue) (isBinary bool, sniffed string) {
	if len(bodyBytes) == 0 {
		return false, ""
	}

	declared := responseMediaType(headers)
	sniffed, _, err := mime.ParseMediaType(http.DetectContentType(bodyBytes))
	if err != nil {
		sniffed = ""
	}
	sniffed = strings.ToLower(sniffed)

	// A declared textual type is trusted only if the bytes back it up; servers
	// mislabel binary as text/html often enough that the check has to be real.
	if !utf8.Valid(bodyBytes) {
		return true, sniffed
	}
	// Valid UTF-8 can still be binary — a NUL byte never appears in real text.
	if bytes.IndexByte(bodyBytes, 0) >= 0 {
		return true, sniffed
	}
	if isTextualMediaType(declared) || isTextualMediaType(sniffed) {
		return false, sniffed
	}
	// No usable type on either side: valid UTF-8 without NULs is text.
	if declared == "" && (sniffed == "" || sniffed == "application/octet-stream") {
		return false, sniffed
	}
	return !isTextualMediaType(declared), sniffed
}

func isTextualMediaType(mediaType string) bool {
	if mediaType == "" {
		return false
	}
	if strings.HasPrefix(mediaType, "text/") {
		return true
	}
	switch mediaType {
	case "application/json", "application/xml", "application/javascript",
		"application/x-www-form-urlencoded", "application/graphql",
		"application/x-ndjson", "application/problem+json", "image/svg+xml":
		return true
	}
	// Structured suffixes: application/vnd.api+json, application/atom+xml, …
	return strings.HasSuffix(mediaType, "+json") || strings.HasSuffix(mediaType, "+xml")
}

func responseMediaType(headers []model.KeyValue) string {
	for _, h := range headers {
		if strings.EqualFold(h.Key, "Content-Type") {
			parsed, _, err := mime.ParseMediaType(h.Value)
			if err != nil {
				return strings.ToLower(strings.TrimSpace(strings.Split(h.Value, ";")[0]))
			}
			return strings.ToLower(parsed)
		}
	}
	return ""
}

func isPreviewableImage(mediaType string) bool {
	_, ok := previewableImageTypes[mediaType]
	return ok
}

// buildPreviewImage returns the base64 of an image response body.
//
// The body crosses the Wails bridge as a JSON string, and JSON encoding
// replaces any byte sequence that is not valid UTF-8. For text that is
// harmless, but it corrupts every image, so the preview needs its own
// lossless channel rather than re-encoding HttpResponse.Body in the frontend.
func buildPreviewImage(bodyBytes []byte, headers []model.KeyValue, truncated bool) (data string, mediaType string) {
	if truncated || len(bodyBytes) == 0 || len(bodyBytes) > maxPreviewImageBytes {
		return "", ""
	}
	mediaType = responseMediaType(headers)
	if !isPreviewableImage(mediaType) {
		// Fall back to sniffing: an image served without a usable Content-Type
		// is still worth previewing.
		sniffed, _, err := mime.ParseMediaType(http.DetectContentType(bodyBytes))
		if err != nil || !isPreviewableImage(strings.ToLower(sniffed)) {
			return "", ""
		}
		mediaType = strings.ToLower(sniffed)
	}
	return base64.StdEncoding.EncodeToString(bodyBytes), mediaType
}
