package api

import (
	"bytes"
	"compress/flate"
	"compress/gzip"
	"compress/zlib"
	"errors"
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

// maxStreamedDecodedBodySize caps a response decompressed straight to disk.
// The buffered path is bounded by memory; this one is not, so a small
// highly-compressible payload could otherwise fill the disk. It is far above
// any real download, and going over it is reported rather than truncating the
// file into something that looks complete.
const maxStreamedDecodedBodySize int64 = 1 << 30

var errDecodedBodyTooLarge = errors.New("decompressed response exceeds 1 GB")

// newDecodingReader wraps body so what the caller reads is the decompressed
// payload, for the download path that streams to a file instead of buffering.
// Without it a response fetched with an explicit Accept-Encoding was written to
// disk still compressed, under a name like report.json.
//
// An encoding that cannot be decoded falls back to the raw bytes, including the
// ones a failed constructor already consumed, so the file is never short.
func newDecodingReader(body io.Reader, resp *http.Response) io.Reader {
	if resp.Uncompressed {
		return body
	}
	encoding := resp.Header.Get("Content-Encoding")
	if encoding == "" {
		return body
	}
	// Chained encodings ("gzip, br") were applied left to right, so they are
	// undone right to left — each wrap peels off the outermost one.
	encodings := strings.Split(encoding, ",")
	current := body
	for i := len(encodings) - 1; i >= 0; i-- {
		name := strings.ToLower(strings.TrimSpace(encodings[i]))
		if name == "" || name == "identity" {
			continue
		}
		next, ok := decodeStream(name, current)
		if !ok {
			return next
		}
		current = next
	}
	return current
}

// sniffReader records what it hands out until stop() is called, so a decoder
// constructor that reads a header and then fails can be rewound. It stops
// recording as soon as the decoder is known to be good, which is what keeps
// this from buffering the whole body.
type sniffReader struct {
	src      io.Reader
	buf      bytes.Buffer
	sniffing bool
}

func newSniffReader(src io.Reader) *sniffReader {
	return &sniffReader{src: src, sniffing: true}
}

func (s *sniffReader) Read(p []byte) (int, error) {
	n, err := s.src.Read(p)
	if s.sniffing && n > 0 {
		s.buf.Write(p[:n])
	}
	return n, err
}

func (s *sniffReader) stop() {
	s.sniffing = false
	s.buf.Reset()
}

// rewind returns a reader replaying what was consumed, followed by the rest.
func (s *sniffReader) rewind() io.Reader {
	return io.MultiReader(bytes.NewReader(s.buf.Bytes()), s.src)
}

func decodeStream(name string, r io.Reader) (io.Reader, bool) {
	sniff := newSniffReader(r)
	switch name {
	case "gzip", "x-gzip":
		zr, err := gzip.NewReader(sniff)
		if err != nil {
			return sniff.rewind(), false
		}
		sniff.stop()
		return cappedStream(zr), true
	case "br":
		sniff.stop()
		return cappedStream(brotli.NewReader(r)), true
	case "zstd":
		zr, err := zstd.NewReader(sniff)
		if err != nil {
			return sniff.rewind(), false
		}
		sniff.stop()
		return cappedStream(zr.IOReadCloser()), true
	case "deflate":
		if zr, err := zlib.NewReader(sniff); err == nil {
			sniff.stop()
			return cappedStream(zr), true
		}
		return cappedStream(flate.NewReader(sniff.rewind())), true
	default:
		return sniff.rewind(), false
	}
}

// cappedStream fails loudly past the size cap rather than handing back a
// truncated file that looks whole.
func cappedStream(r io.Reader) io.Reader {
	return &cappedReader{r: r, remaining: maxStreamedDecodedBodySize}
}

type cappedReader struct {
	r         io.Reader
	remaining int64
}

func (c *cappedReader) Read(p []byte) (int, error) {
	if c.remaining <= 0 {
		return 0, errDecodedBodyTooLarge
	}
	if int64(len(p)) > c.remaining {
		p = p[:c.remaining]
	}
	n, err := c.r.Read(p)
	c.remaining -= int64(n)
	return n, err
}
