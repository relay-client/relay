package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

const browserTestOrigin = "https://app.example.test"

func corsTestServer(t *testing.T) *httptest.Server {
	t.Helper()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/open") {
			w.Header().Set("Access-Control-Allow-Origin", browserTestOrigin)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"ok":true,"origin":"` + r.Header.Get("Origin") + `"}`))
	}))
	t.Cleanup(server.Close)
	return server
}

func writeBrowserWorkspace(t *testing.T, baseURL string) string {
	t.Helper()
	root := t.TempDir()
	write := func(rel, content string) {
		path := filepath.Join(root, rel)
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			t.Fatalf("mkdir: %v", err)
		}
		if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
			t.Fatalf("write %s: %v", rel, err)
		}
	}
	request := func(id, name, file, path string, settings ...string) string {
		lines := []string{
			"version: 1",
			"request:",
			"  id: " + id,
			"  name: " + name,
			"  filesystemName: " + file,
			"  requestType: http",
			"  isDraft: false",
			"  collectionId: col-web",
			"  collection: Web",
			"  folderPath: []",
			"  method: GET",
			"  url: \"{{baseUrl}}" + path + "\"",
			"  auth:",
			"    type: none",
			"  bodyType: none",
			"  bodyContent: \"\"",
		}
		return strings.Join(append(lines, settings...), "\n") + "\n"
	}

	write("kurlo.yml", "version: 1\nformat: kurlo.workspace.yaml.v1\nworkspaceOrder:\n  - ws-demo\n")
	write("workspaces/Demo/workspace.yml", "version: 1\nworkspace:\n  id: ws-demo\n  name: Demo\n  filesystemName: Demo\n  collectionOrder:\n    - col-web\n")
	write("workspaces/Demo/collections/Web/collection.yml", strings.Join([]string{
		"version: 1",
		"collection:",
		"  id: col-web",
		"  workspaceId: ws-demo",
		"  name: Web",
		"  filesystemName: Web",
		"  requestOrder:",
		"    - req-closed",
		"    - req-open",
		"    - req-optout",
		"  defaults:",
		"    settings:",
		"      browserEmulation: true",
		"      browserOrigin: " + browserTestOrigin,
		"      browserEnforceCORS: true",
		"",
	}, "\n"))
	write("workspaces/Demo/environments/Local.yml", strings.Join([]string{
		"version: 1",
		"environment:",
		"  id: env-local",
		"  workspaceId: ws-demo",
		"  name: Local",
		"  filesystemName: Local",
		"  values:",
		"    - id: 1",
		"      enabled: true",
		"      key: baseUrl",
		"      value: " + baseURL,
		"",
	}, "\n"))
	write("workspaces/Demo/collections/Web/requests/GET-1-closed.yml", request("req-closed", "Closed", "GET-1-closed", "/closed/orders"))
	write("workspaces/Demo/collections/Web/requests/GET-2-open.yml", request("req-open", "Open", "GET-2-open", "/open/orders"))
	write("workspaces/Demo/collections/Web/requests/GET-3-optout.yml", request("req-optout", "Opt out", "GET-3-optout", "/closed/health",
		"  settings:",
		"    browserEnforceCORS: false",
		"  settingsOverrides:",
		"    browserEnforceCORS: true",
	))
	write("workspaces/Demo/collections/Web/examples/GET-2-open/Created.yml", strings.Join([]string{
		"version: 1",
		"example:",
		"  id: ex-1",
		"  requestId: req-open",
		"  name: Two orders",
		"  source: captured",
		"  response:",
		"    statusCode: 200",
		"    status: 200 OK",
		"    headers:",
		"      - key: Content-Type",
		"        value: application/json",
		"        enabled: true",
		"    body: '{\"orders\":[1,2]}'",
		"    bodyMediaType: application/json",
		"",
	}, "\n"))
	return root
}

func TestMergeBrowserSettingsFollowsTheAppsOverrides(t *testing.T) {
	collection := cliSettings{BrowserEmulation: true, BrowserOrigin: "https://app.example.test", BrowserEnforceCORS: true, BrowserCSP: "default-src 'self'"}

	inherited := mergeBrowserSettings(collection, cliSettings{}, nil)
	if !inherited.BrowserEmulation || !inherited.BrowserEnforceCORS || inherited.BrowserOrigin != "https://app.example.test" || inherited.BrowserCSP != "default-src 'self'" {
		t.Errorf("a request with default settings should inherit the collection's: %+v", inherited)
	}

	own := mergeBrowserSettings(collection, cliSettings{BrowserOrigin: "http://localhost:5173"}, nil)
	if own.BrowserOrigin != "http://localhost:5173" || !own.BrowserEnforceCORS {
		t.Errorf("without override flags, a non-default value is the request's own: %+v", own)
	}

	optOut := mergeBrowserSettings(collection, cliSettings{}, map[string]bool{"browserEnforceCORS": true})
	if optOut.BrowserEnforceCORS || !optOut.BrowserEmulation {
		t.Errorf("an explicit override to off should win over the collection: %+v", optOut)
	}

	flagged := mergeBrowserSettings(collection, cliSettings{BrowserOrigin: "http://localhost:5173"}, map[string]bool{"timeoutMs": true})
	if flagged.BrowserOrigin != "https://app.example.test" {
		t.Errorf("with override flags present, an unflagged value comes from the collection: %+v", flagged)
	}
}

func TestBuildHTTPRequestCarriesBrowserSettings(t *testing.T) {
	req := cliSavedRequest{Method: "GET", URL: "https://api.example.test", Settings: cliSettings{
		BrowserEmulation: true, BrowserOrigin: " https://app.example.test ", BrowserWithCredentials: true,
		BrowserEnforceCORS: true, BrowserEnforceCSP: true, BrowserCSP: "connect-src 'self'",
	}}
	built := buildHTTPRequest(req, nil, nil, 0)
	if !built.BrowserEmulation || built.BrowserOrigin != "https://app.example.test" || !built.BrowserWithCredentials ||
		!built.BrowserEnforceCORS || !built.BrowserEnforceCSP || built.BrowserCSP != "connect-src 'self'" {
		t.Errorf("browser settings were not carried into the request: %+v", built)
	}
}

func TestRunCLIEnforcesCORSFromCollectionDefaults(t *testing.T) {
	httpTransports.closeAll()
	t.Cleanup(httpTransports.closeAll)
	server := corsTestServer(t)

	var out bytes.Buffer
	code := runCLI(cliOptions{workspace: writeBrowserWorkspace(t, server.URL), env: "Local", reporters: []string{"json"}, iterations: 1, stdout: &out, stderr: &out})
	if code != 1 {
		t.Fatalf("a request a browser would block should fail the run, got exit %d:\n%s", code, out.String())
	}
	var report struct {
		Results []cliRunResult `json:"results"`
	}
	if err := json.Unmarshal(out.Bytes(), &report); err != nil {
		t.Fatalf("parse report: %v\n%s", err, out.String())
	}
	byName := map[string]cliRunResult{}
	for _, result := range report.Results {
		byName[result.Name] = result
	}
	if !strings.Contains(byName["Closed"].Error, "CORS error") {
		t.Errorf("Closed should fail with a CORS error: %+v", byName["Closed"])
	}
	if byName["Open"].Error != "" || byName["Open"].StatusCode != 200 {
		t.Errorf("Open allows the origin and should pass: %+v", byName["Open"])
	}
	if byName["Opt out"].Error != "" {
		t.Errorf("Opt out turns CORS enforcement off for itself: %+v", byName["Opt out"])
	}
}

func TestMCPServerChecksCallsLikeABrowser(t *testing.T) {
	server := corsTestServer(t)
	h := startMCPHarness(t, mcpServerOptions{workspace: writeYAMLWorkspace(t, server.URL), env: "Local"})

	var plain mcpRequestOutcome
	h.tool("send_request", map[string]any{"url": server.URL + "/closed/me"}, &plain)
	if plain.Error != "" || plain.Status != 200 {
		t.Fatalf("without browserOrigin the call is a plain one: %+v", plain)
	}

	var blocked mcpRequestOutcome
	result := h.tool("send_request", map[string]any{"url": server.URL + "/closed/me", "browserOrigin": browserTestOrigin}, &blocked)
	if !strings.Contains(blocked.Error, "CORS error") || !strings.Contains(blocked.Error, browserTestOrigin) {
		t.Errorf("a browser on %s would be refused: %+v", browserTestOrigin, blocked)
	}
	if result.IsError {
		t.Errorf("a CORS refusal is an answer, not a failed tool call")
	}

	var allowed mcpRequestOutcome
	h.tool("send_request", map[string]any{"url": server.URL + "/open/me", "browserOrigin": browserTestOrigin}, &allowed)
	if allowed.Error != "" || !strings.Contains(allowed.Body, `"origin":"`+browserTestOrigin+`"`) {
		t.Errorf("an allowed origin should pass and send the Origin header: %+v", allowed)
	}

	var credentialed mcpRequestOutcome
	h.tool("run_request", map[string]any{"request": "Ok", "browserOrigin": browserTestOrigin, "browserCredentials": true}, &credentialed)
	if !strings.Contains(credentialed.Error, "CORS error") {
		t.Errorf("run_request should take browserOrigin too: %+v", credentialed)
	}
}

func TestMCPServerRunsSavedRequestsWithTheirBrowserSettings(t *testing.T) {
	server := corsTestServer(t)
	h := startMCPHarness(t, mcpServerOptions{workspace: writeBrowserWorkspace(t, server.URL), env: "Local"})

	var closed mcpRequestOutcome
	h.tool("run_request", map[string]any{"request": "Closed"}, &closed)
	if !strings.Contains(closed.Error, "CORS error") {
		t.Errorf("Closed inherits CORS enforcement from its collection: %+v", closed)
	}

	var detail struct {
		Browser struct {
			Origin      string `json:"origin"`
			EnforceCors bool   `json:"enforceCors"`
		} `json:"browser"`
		Examples []mcpExample `json:"examples"`
	}
	h.tool("get_request", map[string]any{"request": "Open"}, &detail)
	if detail.Browser.Origin != browserTestOrigin || !detail.Browser.EnforceCors {
		t.Errorf("get_request should show the effective browser settings: %+v", detail.Browser)
	}
	if len(detail.Examples) != 1 {
		t.Fatalf("get_request should list the saved example: %+v", detail.Examples)
	}
	example := detail.Examples[0]
	if example.Name != "Two orders" || example.Status != 200 || example.ContentType != "application/json" || example.Body != `{"orders":[1,2]}` {
		t.Errorf("example = %+v", example)
	}
}

func TestMCPServerSearchesRequests(t *testing.T) {
	server := corsTestServer(t)
	h := startMCPHarness(t, mcpServerOptions{workspace: writeBrowserWorkspace(t, server.URL)})

	var list struct {
		Count    int                 `json:"count"`
		Requests []mcpRequestSummary `json:"requests"`
	}
	h.tool("list_requests", map[string]any{"query": "GET orders"}, &list)
	if list.Count != 2 || list.Requests[0].Name != "Closed" || list.Requests[1].Name != "Open" {
		t.Errorf("every word must match the path, method or URL: %+v", list)
	}
	h.tool("list_requests", map[string]any{"query": "HEALTH"}, &list)
	if list.Count != 1 || list.Requests[0].Name != "Opt out" {
		t.Errorf("search should ignore case: %+v", list)
	}
	h.tool("list_requests", map[string]any{"query": "post"}, &list)
	if list.Count != 0 {
		t.Errorf("no request is a POST: %+v", list)
	}
}

func TestMCPServerReportsCollectionProgress(t *testing.T) {
	server := corsTestServer(t)
	h := startMCPHarness(t, mcpServerOptions{workspace: writeBrowserWorkspace(t, server.URL), env: "Local"})

	h.nextID++
	id := h.nextID
	h.send(map[string]any{
		"jsonrpc": "2.0", "id": id, "method": "tools/call",
		"params": map[string]any{
			"name":      "run_collection",
			"arguments": map[string]any{"collection": "Web"},
			"_meta":     map[string]any{"progressToken": "run-1"},
		},
	})

	type progressParams struct {
		ProgressToken string `json:"progressToken"`
		Progress      int    `json:"progress"`
		Total         int    `json:"total"`
		Message       string `json:"message"`
	}
	var progress []progressParams
	for {
		line := <-h.lines
		var message struct {
			ID     json.RawMessage `json:"id"`
			Method string          `json:"method"`
			Params progressParams  `json:"params"`
		}
		if err := json.Unmarshal(line, &message); err != nil {
			t.Fatalf("invalid JSON %q: %v", line, err)
		}
		if message.Method == "notifications/progress" {
			progress = append(progress, message.Params)
			continue
		}
		if string(message.ID) != "1" {
			t.Fatalf("unexpected message %s", line)
		}
		break
	}
	if len(progress) != 3 {
		t.Fatalf("want one progress notification per request, got %+v", progress)
	}
	for i, p := range progress {
		if p.ProgressToken != "run-1" || p.Progress != i+1 || p.Total != 3 {
			t.Errorf("progress[%d] = %+v", i, p)
		}
	}
	if !strings.Contains(progress[0].Message, "GET") || !strings.Contains(progress[0].Message, "/closed/orders") || !strings.Contains(progress[0].Message, "failed") {
		t.Errorf("the first message should name the request and its failure: %q", progress[0].Message)
	}

	h.tool("run_collection", map[string]any{"collection": "Web"}, nil)
}
