package api

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/relay-client/relay/apps/desktop/internal/model"
)

func traceTestRequest(url string) model.HttpRequest {
	return model.HttpRequest{
		Method:                http.MethodGet,
		URL:                   url,
		FollowRedirects:       true,
		TimeoutMs:             5000,
		HTTPVersion:           "auto",
		EnableSSLVerification: true,
		MaxRedirects:          10,
	}
}

func headerValue(rows []model.KeyValue, key string) string {
	for _, row := range rows {
		if strings.EqualFold(row.Key, key) {
			return row.Value
		}
	}
	return ""
}

func TestSendRequestRecordsWhatWentOnTheWire(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	req := traceTestRequest(server.URL + "/items")
	req.Headers = []model.KeyValue{{Enabled: true, Key: "X-Trace", Value: "on"}}
	resp := NewApp().SendRequest(req)

	if resp.Error != "" {
		t.Fatalf("unexpected error: %s", resp.Error)
	}
	if len(resp.SentRequests) != 1 {
		t.Fatalf("expected 1 recorded request, got %d", len(resp.SentRequests))
	}
	sent := resp.SentRequests[0]
	if sent.Method != http.MethodGet {
		t.Fatalf("expected GET, got %q", sent.Method)
	}
	if !strings.HasSuffix(sent.URL, "/items") {
		t.Fatalf("expected the recorded URL to end in /items, got %q", sent.URL)
	}
	if got := headerValue(sent.Headers, "X-Trace"); got != "on" {
		t.Fatalf("expected the user header to be recorded, got %q", got)
	}
	// The User-Agent is added by Relay, not the caller: proof the capture
	// happens at the transport rather than on the request the caller built.
	if got := headerValue(sent.Headers, "User-Agent"); !strings.HasPrefix(got, "Relay/") {
		t.Fatalf("expected Relay's own User-Agent to be recorded, got %q", got)
	}

	if len(resp.Timeline) == 0 {
		t.Fatal("expected timeline events")
	}
	labels := make([]string, 0, len(resp.Timeline))
	last := -1.0
	for _, event := range resp.Timeline {
		labels = append(labels, event.Label)
		if event.AtMs < last {
			t.Fatalf("timeline went backwards at %q: %v after %v", event.Label, event.AtMs, last)
		}
		last = event.AtMs
	}
	for _, want := range []string{"Connection requested", "Connection ready", "Request sent", "First response byte"} {
		if !contains(labels, want) {
			t.Fatalf("expected a %q event, got %v", want, labels)
		}
	}
	if resp.Connection.RemoteAddr == "" {
		t.Fatal("expected the remote address to be recorded")
	}
	if resp.Connection.Reused {
		t.Fatal("expected the first request on a fresh pool not to reuse a connection")
	}
}

func TestSendRequestRecordsEveryRedirectHop(t *testing.T) {
	var target *httptest.Server
	target = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/start" {
			http.Redirect(w, r, target.URL+"/end", http.StatusFound)
			return
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer target.Close()

	resp := NewApp().SendRequest(traceTestRequest(target.URL + "/start"))
	if resp.Error != "" {
		t.Fatalf("unexpected error: %s", resp.Error)
	}
	if len(resp.SentRequests) != 2 {
		t.Fatalf("expected both hops to be recorded, got %d", len(resp.SentRequests))
	}
	if !strings.HasSuffix(resp.SentRequests[0].URL, "/start") || !strings.HasSuffix(resp.SentRequests[1].URL, "/end") {
		t.Fatalf("expected /start then /end, got %q then %q", resp.SentRequests[0].URL, resp.SentRequests[1].URL)
	}
}

// The panel is something users screenshot, so a header built from a secret
// environment value must not carry that value into the trace.
func TestSentRequestsRedactSecretValues(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	req := traceTestRequest(server.URL)
	req.Headers = []model.KeyValue{{Enabled: true, Key: "Authorization", Value: "Bearer super-secret-token"}}
	req.SecretEnvironmentValues = []string{"super-secret-token"}
	resp := NewApp().SendRequest(req)

	if resp.Error != "" {
		t.Fatalf("unexpected error: %s", resp.Error)
	}
	got := headerValue(resp.SentRequests[0].Headers, "Authorization")
	if strings.Contains(got, "super-secret-token") {
		t.Fatalf("secret leaked into the trace: %q", got)
	}
	if got != "Bearer [secret]" {
		t.Fatalf("expected the secret to be masked, got %q", got)
	}
}

// A request that fails is exactly when the timeline matters, so it has to be
// attached to the error response too.
func TestFailedRequestStillCarriesATimeline(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {}))
	url := server.URL
	server.Close()

	resp := NewApp().SendRequest(traceTestRequest(url))
	if resp.Error == "" {
		t.Fatal("expected the request to fail against a closed server")
	}
	if len(resp.SentRequests) != 1 {
		t.Fatalf("expected the attempted request to be recorded, got %d", len(resp.SentRequests))
	}
	if len(resp.Timeline) == 0 {
		t.Fatal("expected timeline events on a failed request")
	}
}

func contains(values []string, want string) bool {
	for _, value := range values {
		if value == want {
			return true
		}
	}
	return false
}
