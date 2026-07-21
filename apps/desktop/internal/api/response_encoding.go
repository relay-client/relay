package api

import (
	"bytes"
	"compress/flate"
	"compress/gzip"
	"compress/zlib"
	"io"
	"net/http"
	"strings"

	"github.com/andybalholm/brotli"
	"github.com/klauspost/compress/zstd"
)

// maxDecodedResponseBodySize caps the size of a decompressed body so a small
// but highly-compressible payload (a "zip bomb") cannot exhaust memory.
const maxDecodedResponseBodySize = 64 * 1024 * 1024

// decodeResponseBody transparently decompresses a response body according to its
// Content-Encoding, so gzip/deflate/br/zstd payloads are shown as readable text
// instead of raw compressed bytes.
//
// Go's transport only auto-decompresses gzip, and only when it added the
// Accept-Encoding header itself. As soon as the request carries an explicit
// Accept-Encoding (e.g. "gzip, deflate, br, zstd"), that automatic handling is
// disabled and the compressed bytes reach us untouched — this restores it for
// every common encoding.
//
// It returns the decoded bytes and true on success. If the body was not
// compressed, the encoding is unknown, or decoding fails, it returns the
// original bytes and false so the caller can fall back to the raw response.
func decodeResponseBody(body []byte, resp *http.Response) ([]byte, bool) {
	// Go already decompressed the body transparently; it strips Content-Encoding
	// when it does, so there is nothing left to decode.
	if resp.Uncompressed {
		return body, false
	}
	encoding := resp.Header.Get("Content-Encoding")
	if encoding == "" || len(body) == 0 {
		return body, false
	}

	// Content-Encoding may chain encodings ("gzip, br"); they were applied left
	// to right, so decode right to left.
	encodings := strings.Split(encoding, ",")
	current := body
	decodedAny := false
	for i := len(encodings) - 1; i >= 0; i-- {
		name := strings.ToLower(strings.TrimSpace(encodings[i]))
		if name == "" || name == "identity" {
			continue
		}
		decoded, ok := decodeOne(name, current)
		if !ok {
			return body, false
		}
		current = decoded
		decodedAny = true
	}
	if !decodedAny {
		return body, false
	}
	return current, true
}

func decodeOne(name string, data []byte) ([]byte, bool) {
	switch name {
	case "gzip", "x-gzip":
		r, err := gzip.NewReader(bytes.NewReader(data))
		if err != nil {
			return nil, false
		}
		defer r.Close()
		return readAllCapped(r)
	case "br":
		return readAllCapped(brotli.NewReader(bytes.NewReader(data)))
	case "zstd":
		r, err := zstd.NewReader(bytes.NewReader(data))
		if err != nil {
			return nil, false
		}
		defer r.Close()
		return readAllCapped(r)
	case "deflate":
		// HTTP "deflate" officially means zlib (RFC 1950), but many servers send
		// a raw DEFLATE stream (RFC 1951). Try zlib first, then fall back to raw.
		if r, err := zlib.NewReader(bytes.NewReader(data)); err == nil {
			defer r.Close()
			if out, ok := readAllCapped(r); ok {
				return out, true
			}
		}
		r := flate.NewReader(bytes.NewReader(data))
		defer r.Close()
		return readAllCapped(r)
	default:
		return nil, false
	}
}

func readAllCapped(r io.Reader) ([]byte, bool) {
	out, err := io.ReadAll(io.LimitReader(r, maxDecodedResponseBodySize+1))
	if err != nil {
		return nil, false
	}
	if int64(len(out)) > maxDecodedResponseBodySize {
		return nil, false
	}
	return out, true
}
