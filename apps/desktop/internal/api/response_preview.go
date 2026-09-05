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

	if !utf8.Valid(bodyBytes) {
		return true, sniffed
	}
	if bytes.IndexByte(bodyBytes, 0) >= 0 {
		return true, sniffed
	}
	if isTextualMediaType(declared) || isTextualMediaType(sniffed) {
		return false, sniffed
	}
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

func buildPreviewImage(bodyBytes []byte, headers []model.KeyValue, truncated bool) (data string, mediaType string) {
	if truncated || len(bodyBytes) == 0 || len(bodyBytes) > maxPreviewImageBytes {
		return "", ""
	}
	mediaType = responseMediaType(headers)
	if !isPreviewableImage(mediaType) {
		sniffed, _, err := mime.ParseMediaType(http.DetectContentType(bodyBytes))
		if err != nil || !isPreviewableImage(strings.ToLower(sniffed)) {
			return "", ""
		}
		mediaType = strings.ToLower(sniffed)
	}
	return base64.StdEncoding.EncodeToString(bodyBytes), mediaType
}
