package api

import (
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/relay-client/relay/apps/desktop/internal/api/state"
	"github.com/relay-client/relay/apps/desktop/internal/model"
)

type framing struct {
	contentLength    string
	transferEncoding []string
	body             string
	method           string
}

func captureFraming(t *testing.T, req model.HttpRequest, handler func(http.ResponseWriter, *http.Request)) framing {
	t.Helper()
	var seen framing
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		raw, _ := io.ReadAll(r.Body)
		seen = framing{
			contentLength:    r.Header.Get("Content-Length"),
			transferEncoding: r.TransferEncoding,
			body:             string(raw),
			method:           r.Method,
		}
		if handler != nil {
			handler(w, r)
			return
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	if req.URL == "" {
		req.URL = srv.URL
	} else {
		req.URL = srv.URL + req.URL
	}
	resp := sendRequest(t.Context(), req, state.New(), newCookieJarRegistry(), newPreflightCache())
	if resp.Error != "" {
		t.Fatalf("send: %s", resp.Error)
	}
	return seen
}

func writeFixture(t *testing.T, name, content string) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), name)
	if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
		t.Fatalf("write fixture: %v", err)
	}
	return path
}

func TestBinaryBodyDeclaresContentLength(t *testing.T) {
	payload := "hello world payload"
	path := writeFixture(t, "payload.bin", payload)

	seen := captureFraming(t, model.HttpRequest{
		Method:       http.MethodPut,
		BodyType:     "binary",
		BodyFilePath: path,
	}, nil)

	if want := fmt.Sprint(len(payload)); seen.contentLength != want {
		t.Errorf("Content-Length = %q, want %q", seen.contentLength, want)
	}
	if len(seen.transferEncoding) != 0 {
		t.Errorf("body was framed %v, want a plain length-delimited body", seen.transferEncoding)
	}
	if seen.body != payload {
		t.Errorf("body = %q, want %q", seen.body, payload)
	}
}

func TestBinaryBodySurvivesRedirect(t *testing.T) {
	payload := "replay me"
	path := writeFixture(t, "payload.bin", payload)

	var final framing
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/start" {
			http.Redirect(w, r, "/moved", http.StatusTemporaryRedirect)
			return
		}
		raw, _ := io.ReadAll(r.Body)
		final = framing{
			contentLength:    r.Header.Get("Content-Length"),
			transferEncoding: r.TransferEncoding,
			body:             string(raw),
			method:           r.Method,
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	resp := sendRequest(t.Context(), model.HttpRequest{
		Method:          http.MethodPut,
		URL:             srv.URL + "/start",
		BodyType:        "binary",
		BodyFilePath:    path,
		FollowRedirects: true,
	}, state.New(), newCookieJarRegistry(), newPreflightCache())
	if resp.Error != "" {
		t.Fatalf("send: %s", resp.Error)
	}
	if final.body != payload {
		t.Errorf("body after redirect = %q, want %q", final.body, payload)
	}
	if final.method != http.MethodPut {
		t.Errorf("method after 307 = %q, want PUT", final.method)
	}
}

func TestMultipartBodyDeclaresContentLength(t *testing.T) {
	path := writeFixture(t, "avatar.png", "not really a png")

	seen := captureFraming(t, model.HttpRequest{
		Method:   http.MethodPost,
		BodyType: "form",
		FormData: []model.KeyValue{
			{Key: "avatar", Value: path, Enabled: true, IsFile: true, ContentType: "image/png"},
			{Key: "meta", Value: `{"a":1}`, Enabled: true, ContentType: "application/json"},
			{Key: "plain", Value: "hello", Enabled: true},
			{Key: "off", Value: "ignored"},
		},
	}, nil)

	if want := fmt.Sprint(len(seen.body)); seen.contentLength != want {
		t.Errorf("Content-Length = %q, want %q (the bytes the server read)", seen.contentLength, want)
	}
	if len(seen.transferEncoding) != 0 {
		t.Errorf("body was framed %v, want a plain length-delimited body", seen.transferEncoding)
	}
}

func TestMultipartBodyLengthMatchesStream(t *testing.T) {
	dir := t.TempDir()
	file := filepath.Join(dir, "data.bin")
	if err := os.WriteFile(file, []byte(strings.Repeat("x", 1234)), 0o600); err != nil {
		t.Fatalf("write fixture: %v", err)
	}
	empty := filepath.Join(dir, "empty.bin")
	if err := os.WriteFile(empty, nil, 0o600); err != nil {
		t.Fatalf("write fixture: %v", err)
	}

	cases := []struct {
		name string
		rows []model.KeyValue
	}{
		{"no rows at all", nil},
		{"only disabled rows", []model.KeyValue{{Key: "a", Value: "b"}}},
		{"one text part", []model.KeyValue{{Key: "a", Value: "b", Enabled: true}}},
		{"text part with a type", []model.KeyValue{{Key: "a", Value: `{"a":1}`, Enabled: true, ContentType: "application/json"}}},
		{"empty text part", []model.KeyValue{{Key: "a", Enabled: true}}},
		{"file with no type", []model.KeyValue{{Key: "f", Value: file, Enabled: true, IsFile: true}}},
		{"file with a type", []model.KeyValue{{Key: "f", Value: file, Enabled: true, IsFile: true, ContentType: "image/png"}}},
		{"file with an explicit name", []model.KeyValue{{Key: "f", Value: file, Enabled: true, IsFile: true, FileName: "renamed.bin"}}},
		{"empty file", []model.KeyValue{{Key: "f", Value: empty, Enabled: true, IsFile: true}}},
		{"file row with no path", []model.KeyValue{{Key: "f", Enabled: true, IsFile: true}}},
		{"name needing escapes", []model.KeyValue{{Key: `od"d`, Value: "v", Enabled: true}}},
		{"unicode value", []model.KeyValue{{Key: "note", Value: "привет 👋", Enabled: true}}},
		{"several mixed parts", []model.KeyValue{
			{Key: "f", Value: file, Enabled: true, IsFile: true, ContentType: "image/png"},
			{Key: "a", Value: "b", Enabled: true},
			{Key: "skipped", Value: "x"},
			{Key: "", Value: "no key", Enabled: true},
			{Key: "c", Value: strings.Repeat("y", 4096), Enabled: true, ContentType: "text/plain"},
		}},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			const boundary = "relay-fixed-boundary-for-the-test"
			computed, ok := multipartBodyLength(tc.rows, boundary)
			if !ok {
				t.Fatal("length could not be computed for a fixture that exists")
			}
			actual, err := io.ReadAll(streamMultipartBody(tc.rows, boundary))
			if err != nil {
				t.Fatalf("stream multipart body: %v", err)
			}
			if computed != int64(len(actual)) {
				t.Errorf("computed length %d, streamed %d bytes", computed, len(actual))
			}
		})
	}
}

func TestMultipartLengthUnknownForMissingFile(t *testing.T) {
	rows := []model.KeyValue{{Key: "f", Value: filepath.Join(t.TempDir(), "gone.bin"), Enabled: true, IsFile: true}}
	if _, ok := multipartBodyLength(rows, "boundary"); ok {
		t.Error("a file that cannot be stat'd must leave the length unknown")
	}
}

func TestMultipartPartNameCannotInjectHeaders(t *testing.T) {
	body, err := buildMultipartRequestBody([]model.KeyValue{
		{Key: "a\r\nX-Injected: yes", Value: "v", Enabled: true},
	})
	if err != nil {
		t.Fatalf("build multipart body: %v", err)
	}
	if body.cleanup != nil {
		defer body.cleanup()
	}
	raw, err := io.ReadAll(body.reader)
	if err != nil {
		t.Fatalf("read body: %v", err)
	}
	if strings.Contains(string(raw), "X-Injected: yes\r\n") {
		t.Errorf("a CRLF in a field name injected a header:\n%s", raw)
	}
}

func TestEmptyFormBodyOnGetSendsNothing(t *testing.T) {
	for _, bodyType := range []string{"urlencoded", "form"} {
		t.Run(bodyType, func(t *testing.T) {
			seen := captureFraming(t, model.HttpRequest{
				Method:   http.MethodGet,
				BodyType: bodyType,
				FormData: []model.KeyValue{{Key: "off", Value: "ignored"}},
			}, nil)
			if seen.body != "" {
				t.Errorf("GET sent a body: %q", seen.body)
			}
			if seen.contentLength != "" && seen.contentLength != "0" {
				t.Errorf("Content-Length = %q, want none", seen.contentLength)
			}
		})
	}
}

func TestPostWithEmptyFormStillSendsBody(t *testing.T) {
	seen := captureFraming(t, model.HttpRequest{
		Method:   http.MethodPost,
		BodyType: "urlencoded",
	}, nil)
	if seen.contentLength != "0" {
		t.Errorf("Content-Length = %q, want 0", seen.contentLength)
	}
}

func TestAuthTabOverridingHeaderIsReported(t *testing.T) {
	cases := []struct {
		name   string
		header model.KeyValue
		auth   model.AuthConfig
		want   string
	}{
		{
			name:   "bearer over a hand-written Authorization",
			header: model.KeyValue{Key: "Authorization", Value: "Bearer FROM-HEADER", Enabled: true},
			auth:   model.AuthConfig{Type: "bearer", Token: "FROM-AUTH-TAB"},
			want:   "Authorization",
		},
		{
			name:   "basic over a hand-written Authorization",
			header: model.KeyValue{Key: "authorization", Value: "Bearer FROM-HEADER", Enabled: true},
			auth:   model.AuthConfig{Type: "basic", Username: "u", Password: "p"},
			want:   "Authorization",
		},
		{
			name:   "api key over the header it is configured under",
			header: model.KeyValue{Key: "X-Api-Key", Value: "FROM-HEADER", Enabled: true},
			auth:   model.AuthConfig{Type: "apikey", KeyIn: "header", KeyName: "X-Api-Key", KeyValue: "FROM-AUTH-TAB"},
			want:   "X-Api-Key",
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(http.StatusOK)
			}))
			defer srv.Close()

			resp := sendRequest(t.Context(), model.HttpRequest{
				Method:  http.MethodGet,
				URL:     srv.URL,
				Headers: []model.KeyValue{tc.header},
				Auth:    tc.auth,
			}, state.New(), newCookieJarRegistry(), newPreflightCache())
			if resp.Error != "" {
				t.Fatalf("send: %s", resp.Error)
			}
			if !warningMentions(resp.Warnings, tc.want) {
				t.Errorf("no warning named %s; warnings = %v", tc.want, resp.Warnings)
			}
		})
	}
}

func TestUnrelatedHeadersAreNotReported(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	resp := sendRequest(t.Context(), model.HttpRequest{
		Method: http.MethodGet,
		URL:    srv.URL,
		Headers: []model.KeyValue{
			{Key: "X-Trace", Value: "abc", Enabled: true},
			{Key: "Host", Value: "vhost.example", Enabled: true},
			{Key: "Content-Length", Value: "99", Enabled: true},
			{Key: "Accept", Value: "application/json", Enabled: true},
		},
		Auth: model.AuthConfig{Type: "bearer", Token: "t"},
	}, state.New(), newCookieJarRegistry(), newPreflightCache())
	if resp.Error != "" {
		t.Fatalf("send: %s", resp.Error)
	}
	for _, name := range []string{"X-Trace", "Host", "Accept"} {
		if warningMentions(resp.Warnings, "Auth tab: "+name) {
			t.Errorf("%s was reported as overridden; warnings = %v", name, resp.Warnings)
		}
	}
}

func warningMentions(warnings []string, needle string) bool {
	for _, warning := range warnings {
		if strings.Contains(warning, needle) {
			return true
		}
	}
	return false
}

func TestAwsHostIsNotReportedAsOverridden(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	resp := sendRequest(t.Context(), model.HttpRequest{
		Method:  http.MethodGet,
		URL:     srv.URL,
		Headers: []model.KeyValue{{Key: "Host", Value: "vhost.example", Enabled: true}},
		Auth: model.AuthConfig{
			Type: "aws", AWSRegion: "us-east-1", AWSService: "execute-api",
			AWSAccessKey: "AKIA", AWSSecretKey: "secret",
		},
	}, state.New(), newCookieJarRegistry(), newPreflightCache())
	if resp.Error != "" {
		t.Fatalf("send: %s", resp.Error)
	}
	if warningMentions(resp.Warnings, "Auth tab: Host") {
		t.Errorf("Host was reported as overridden; warnings = %v", resp.Warnings)
	}
}
