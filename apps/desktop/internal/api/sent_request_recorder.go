package api

import (
	"net/http"
	"sort"
	"sync"

	"github.com/relay-client/relay/apps/desktop/internal/model"
)

// sentRequestRecorder captures each request as the transport is about to write
// it. That is the only place where the full picture exists: cookies from the
// jar, the Authorization header a digest retry adds, and the rewritten method
// and headers of a redirect hop are all applied after the caller's *Request is
// built, so reading the caller's copy would show something the server never saw.
type sentRequestRecorder struct {
	base http.RoundTripper

	mu       sync.Mutex
	requests []model.SentRequest
	secrets  []string
}

func newSentRequestRecorder(base http.RoundTripper, secrets []string) *sentRequestRecorder {
	return &sentRequestRecorder{base: base, secrets: secrets}
}

func (s *sentRequestRecorder) RoundTrip(req *http.Request) (*http.Response, error) {
	s.record(req)
	return s.base.RoundTrip(req)
}

func (s *sentRequestRecorder) record(req *http.Request) {
	if req == nil {
		return
	}
	proto := req.Proto
	if proto == "" {
		proto = "HTTP/1.1"
	}
	url := ""
	if req.URL != nil {
		url = req.URL.String()
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	s.requests = append(s.requests, model.SentRequest{
		Method:  req.Method,
		URL:     redactSecrets(url, s.secrets),
		Proto:   proto,
		Headers: redactedHeaderRows(req.Header, s.secrets),
	})
}

func (s *sentRequestRecorder) snapshot() []model.SentRequest {
	s.mu.Lock()
	defer s.mu.Unlock()
	if len(s.requests) == 0 {
		return nil
	}
	out := make([]model.SentRequest, len(s.requests))
	copy(out, s.requests)
	return out
}

// redactedHeaderRows flattens headers into stable, sorted rows with secret
// environment values masked — the panel is something users screenshot and
// paste into issues, and an Authorization header built from a secret variable
// should not leak that way.
func redactedHeaderRows(headers http.Header, secrets []string) []model.KeyValue {
	rows := make([]model.KeyValue, 0, len(headers))
	for key, values := range headers {
		for _, value := range values {
			rows = append(rows, model.KeyValue{
				Key:     key,
				Value:   redactSecrets(value, secrets),
				Enabled: true,
			})
		}
	}
	sort.SliceStable(rows, func(i, j int) bool {
		if rows[i].Key == rows[j].Key {
			return rows[i].Value < rows[j].Value
		}
		return rows[i].Key < rows[j].Key
	})
	return rows
}
