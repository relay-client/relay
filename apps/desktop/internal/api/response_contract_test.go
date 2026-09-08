package api

import (
	"encoding/json"
	"testing"

	"github.com/relay-client/relay/apps/desktop/internal/api/state"
	"github.com/relay-client/relay/apps/desktop/internal/model"
)

func decodeResponseField(t *testing.T, resp model.HttpResponse, field string) any {
	t.Helper()
	raw, err := json.Marshal(resp)
	if err != nil {
		t.Fatalf("marshal response: %v", err)
	}
	var decoded map[string]any
	if err := json.Unmarshal(raw, &decoded); err != nil {
		t.Fatalf("unmarshal response: %v", err)
	}
	value, ok := decoded[field]
	if !ok {
		t.Fatalf("response has no %q field: %s", field, raw)
	}
	return value
}

// The generated binding types headers as KeyValue[], not KeyValue[] | null, and
// the frontend reads it on every send to record history. A nil slice marshals
// to null, so a request that fails before any response arrives used to crash
// the panel with a TypeError — which then replaced the message explaining why
// the request had failed.
func TestFailedRequestStillCarriesHeadersArray(t *testing.T) {
	cases := []struct {
		name string
		req  model.HttpRequest
	}{
		{"unreachable host", model.HttpRequest{Method: "POST", URL: "http://127.0.0.1:1/nope", BodyType: "json", Body: `{"a":1}`}},
		{"unresolved variable", model.HttpRequest{Method: "GET", URL: "https://{{host}}/x"}},
		{"unsupported scheme", model.HttpRequest{Method: "GET", URL: "ftp://example.test/x"}},
		{"missing host", model.HttpRequest{Method: "GET", URL: "http:///x"}},
		{"bad client certificate", model.HttpRequest{Method: "GET", URL: "https://example.test/x", ClientCertPath: "/nope/missing.pem"}},
		{"pre-request script failure", model.HttpRequest{Method: "GET", URL: "https://example.test/x", ScriptEngine: "js", PreRequestScript: "throw new Error('boom')"}},
		{"skipped by script", model.HttpRequest{Method: "GET", URL: "https://example.test/x", ScriptEngine: "js", PreRequestScript: "pm.execution.skipRequest()"}},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			resp := sendRequest(t.Context(), tc.req, state.New(), newCookieJarRegistry(), newPreflightCache())
			if resp.Error == "" && !resp.Skipped {
				t.Fatalf("expected this request to fail, got status %d", resp.StatusCode)
			}
			headers := decodeResponseField(t, resp, "headers")
			if headers == nil {
				t.Error("headers serialized as null; the frontend types it as an array and reads it on every send")
			}
			if _, ok := headers.([]any); !ok {
				t.Errorf("headers = %T, want an array", headers)
			}
		})
	}
}
