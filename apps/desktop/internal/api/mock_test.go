package api

import (
	"encoding/json"
	"io"
	"net/http"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/relay-client/relay/apps/desktop/internal/model"
)

func mockRoute(method, path string, status int, body string) model.MockRoute {
	return model.MockRoute{
		ExampleID:     method + " " + path,
		ExampleName:   method + " " + path,
		Method:        method,
		PathTemplate:  path,
		StatusCode:    status,
		Body:          body,
		BodyMediaType: "application/json",
	}
}

func TestSelectMockRoutePrefersTheMoreSpecificPath(t *testing.T) {
	routes := compileMockRoutes([]model.MockRoute{
		mockRoute("GET", "/pets/:id", 200, `{"one":true}`),
		mockRoute("GET", "/pets/featured", 200, `{"featured":true}`),
	})

	matched, ok := selectMockRoute(routes, "GET", "/pets/featured", nil)
	if !ok {
		t.Fatal("no route matched")
	}
	if matched.route.Body != `{"featured":true}` {
		t.Errorf("a literal segment must win over a parameter, got %s", matched.route.Body)
	}

	matched, ok = selectMockRoute(routes, "GET", "/pets/42", nil)
	if !ok {
		t.Fatal("no route matched the parameter path")
	}
	if matched.route.Body != `{"one":true}` {
		t.Errorf("expected the parameter route, got %s", matched.route.Body)
	}
}

func TestSelectMockRouteMatchesMethodAndShape(t *testing.T) {
	routes := compileMockRoutes([]model.MockRoute{
		mockRoute("GET", "/pets", 200, "list"),
		mockRoute("POST", "/pets", 201, "created"),
	})

	cases := []struct {
		method string
		path   string
		want   string
		found  bool
	}{
		{"GET", "/pets", "list", true},
		{"POST", "/pets", "created", true},
		{"get", "/pets/", "list", true},
		{"DELETE", "/pets", "", false},
		{"GET", "/pets/1", "", false},
		{"GET", "/", "", false},
	}
	for _, tc := range cases {
		matched, ok := selectMockRoute(routes, tc.method, tc.path, nil)
		if ok != tc.found {
			t.Errorf("%s %s: matched=%v, want %v", tc.method, tc.path, ok, tc.found)
			continue
		}
		if ok && matched.route.Body != tc.want {
			t.Errorf("%s %s: body %q, want %q", tc.method, tc.path, matched.route.Body, tc.want)
		}
	}
}

func TestSelectMockRouteHonoursRequiredQuery(t *testing.T) {
	withQuery := mockRoute("GET", "/pets", 200, "open only")
	withQuery.Query = []model.KeyValue{{Key: "status", Value: "open"}}
	routes := compileMockRoutes([]model.MockRoute{
		mockRoute("GET", "/pets", 200, "any"),
		withQuery,
	})

	matched, ok := selectMockRoute(routes, "GET", "/pets", url.Values{"status": {"open"}})
	if !ok || matched.route.Body != "open only" {
		t.Errorf("a route constraining the query must win when it matches, got %v %q", ok, matched.route.Body)
	}

	matched, ok = selectMockRoute(routes, "GET", "/pets", url.Values{"status": {"closed"}})
	if !ok || matched.route.Body != "any" {
		t.Errorf("a mismatched query must fall through to the unconstrained route, got %v %q", ok, matched.route.Body)
	}
}

func TestMockPathTemplateAcceptsBraceParameters(t *testing.T) {
	routes := compileMockRoutes([]model.MockRoute{mockRoute("GET", "/pets/{petId}/toys", 200, "toys")})
	if _, ok := selectMockRoute(routes, "GET", "/pets/9/toys", nil); !ok {
		t.Error("an OpenAPI-style {param} segment must match like :param")
	}
}

func startTestMock(t *testing.T, config model.MockServerConfig) (*mockServer, string, chan model.MockRequestLog) {
	t.Helper()
	server := newMockServer()
	logs := make(chan model.MockRequestLog, 16)
	status := server.start(config, func(entry model.MockRequestLog) { logs <- entry })
	if status.Error != "" {
		t.Fatalf("start mock server: %s", status.Error)
	}
	t.Cleanup(func() { server.stop() })
	return server, status.URL, logs
}

func TestMockServerServesTheExample(t *testing.T) {
	route := mockRoute("GET", "/pets/:id", 201, `{"id":"p_1"}`)
	route.Headers = []model.KeyValue{
		{Key: "Content-Type", Value: "application/json"},
		{Key: "X-Total-Count", Value: "1"},
		{Key: "Content-Length", Value: "999"},
	}
	_, base, logs := startTestMock(t, model.MockServerConfig{Routes: []model.MockRoute{route}})

	resp, err := http.Get(base + "/pets/42")
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)

	if resp.StatusCode != 201 {
		t.Errorf("status = %d, want 201", resp.StatusCode)
	}
	if string(body) != `{"id":"p_1"}` {
		t.Errorf("body = %q", body)
	}
	if got := resp.Header.Get("X-Total-Count"); got != "1" {
		t.Errorf("X-Total-Count = %q, want 1", got)
	}
	if got := resp.Header.Get("Content-Length"); got == "999" {
		t.Error("a recorded Content-Length must not override the real one")
	}

	select {
	case entry := <-logs:
		if !entry.Matched || entry.StatusCode != 201 || entry.Path != "/pets/42" {
			t.Errorf("log entry = %+v", entry)
		}
	case <-time.After(2 * time.Second):
		t.Error("no request was logged")
	}
}

func TestMockServerExplainsAnUnmatchedRequest(t *testing.T) {
	_, base, logs := startTestMock(t, model.MockServerConfig{
		Routes: []model.MockRoute{mockRoute("GET", "/pets", 200, "list")},
	})

	resp, err := http.Get(base + "/unknown")
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)

	if resp.StatusCode != http.StatusNotFound {
		t.Errorf("status = %d, want 404", resp.StatusCode)
	}
	var payload struct {
		Error     string   `json:"error"`
		Available []string `json:"available"`
	}
	if err := json.Unmarshal(body, &payload); err != nil {
		t.Fatalf("404 body is not JSON: %v (%s)", err, body)
	}
	if len(payload.Available) != 1 || payload.Available[0] != "GET /pets" {
		t.Errorf("the 404 must list what is available, got %v", payload.Available)
	}

	select {
	case entry := <-logs:
		if entry.Matched || entry.StatusCode != 404 {
			t.Errorf("an unmatched request must still be logged, got %+v", entry)
		}
	case <-time.After(2 * time.Second):
		t.Error("no request was logged")
	}
}

func TestMockServerAnswersPreflight(t *testing.T) {
	_, base, _ := startTestMock(t, model.MockServerConfig{
		Routes: []model.MockRoute{mockRoute("GET", "/pets", 200, "list")},
	})

	req, _ := http.NewRequest(http.MethodOptions, base+"/pets", nil)
	req.Header.Set("Origin", "http://localhost:5173")
	req.Header.Set("Access-Control-Request-Method", "GET")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("preflight: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusNoContent {
		t.Errorf("preflight status = %d, want 204", resp.StatusCode)
	}
	if got := resp.Header.Get("Access-Control-Allow-Origin"); got != "http://localhost:5173" {
		t.Errorf("Allow-Origin = %q, want the requesting origin", got)
	}
}

func TestMockServerRefusesAnEmptyCollection(t *testing.T) {
	server := newMockServer()
	status := server.start(model.MockServerConfig{Port: 0}, nil)
	if status.Error == "" {
		t.Fatal("starting with no routes must be refused")
	}
	if !strings.Contains(status.Error, "no saved examples") {
		t.Errorf("error should say why, got %q", status.Error)
	}
}

func TestMockServerReportsAPortAlreadyInUse(t *testing.T) {
	routes := []model.MockRoute{mockRoute("GET", "/pets", 200, "list")}
	first, base, _ := startTestMock(t, model.MockServerConfig{Routes: routes})
	port := first.status().Port
	if port == 0 || base == "" {
		t.Fatal("the first server did not report a port")
	}

	second := newMockServer()
	status := second.start(model.MockServerConfig{Port: port, Routes: routes}, nil)
	t.Cleanup(func() { second.stop() })
	if status.Error == "" {
		t.Fatal("binding a taken port must fail")
	}
	if !strings.Contains(status.Error, "already in use") {
		t.Errorf("error should name the cause, got %q", status.Error)
	}
}

func TestMockServerStopsServing(t *testing.T) {
	server, base, _ := startTestMock(t, model.MockServerConfig{
		Routes: []model.MockRoute{mockRoute("GET", "/pets", 200, "list")},
	})
	server.stop()

	if server.status().Running {
		t.Error("status must report the server as stopped")
	}
	client := http.Client{Timeout: 2 * time.Second}
	if _, err := client.Get(base + "/pets"); err == nil {
		t.Error("the port must stop answering once stopped")
	}
}

func TestMockServerRestartsOntoANewCollection(t *testing.T) {
	server, base, _ := startTestMock(t, model.MockServerConfig{
		CollectionName: "First",
		Routes:         []model.MockRoute{mockRoute("GET", "/one", 200, "one")},
	})

	status := server.start(model.MockServerConfig{
		CollectionName: "Second",
		Routes:         []model.MockRoute{mockRoute("GET", "/two", 200, "two")},
	}, nil)
	if status.Error != "" {
		t.Fatalf("restart: %s", status.Error)
	}
	if status.CollectionName != "Second" {
		t.Errorf("status still names %q", status.CollectionName)
	}
	if status.URL == base {
		t.Log("the restart reused the same port, which is fine")
	}

	resp, err := http.Get(status.URL + "/two")
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		t.Errorf("the new collection is not being served: status %d", resp.StatusCode)
	}
}

func TestMockServerSimulatesRecordedLatency(t *testing.T) {
	route := mockRoute("GET", "/slow", 200, "slow")
	route.DelayMs = 120
	_, base, _ := startTestMock(t, model.MockServerConfig{
		Routes:          []model.MockRoute{route},
		SimulateLatency: true,
	})

	start := time.Now()
	resp, err := http.Get(base + "/slow")
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	defer resp.Body.Close()
	if elapsed := time.Since(start); elapsed < 100*time.Millisecond {
		t.Errorf("recorded latency was not applied: %s", elapsed)
	}
}

func TestMockServerIgnoresLatencyWhenTurnedOff(t *testing.T) {
	route := mockRoute("GET", "/slow", 200, "slow")
	route.DelayMs = 5000
	_, base, _ := startTestMock(t, model.MockServerConfig{Routes: []model.MockRoute{route}})

	start := time.Now()
	resp, err := http.Get(base + "/slow")
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	defer resp.Body.Close()
	if elapsed := time.Since(start); elapsed > 2*time.Second {
		t.Errorf("latency was applied while switched off: %s", elapsed)
	}
}

func TestMockServerBindsLoopbackOnly(t *testing.T) {
	server, _, _ := startTestMock(t, model.MockServerConfig{
		Routes: []model.MockRoute{mockRoute("GET", "/pets", 200, "list")},
	})
	addr := server.listener.Addr().String()
	if !strings.HasPrefix(addr, "127.0.0.1:") {
		t.Errorf("the mock must not be reachable from the network, bound %s", addr)
	}
}
