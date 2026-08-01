package api

import (
	"bytes"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func writeDefaultsWorkspace(t *testing.T, baseURL, collectionDefaults, requestBody string) string {
	t.Helper()
	root := t.TempDir()
	write := func(rel, content string) {
		p := filepath.Join(root, rel)
		if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(p, []byte(content), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	write("relay.yml", "version: 1\nformat: relay.workspace.yaml.v1\nworkspaceOrder:\n  - ws\n")
	write("workspaces/Demo/workspace.yml", "version: 1\nworkspace:\n  id: ws\n  name: Demo\n  filesystemName: Demo\n  collectionOrder:\n    - col\n")
	write("workspaces/Demo/collections/Smoke/collection.yml", strings.Join([]string{
		"version: 1",
		"collection:",
		"  id: col",
		"  workspaceId: ws",
		"  name: Smoke",
		"  filesystemName: Smoke",
		"  requestOrder: [req]",
		"  defaults:",
		collectionDefaults,
		"",
	}, "\n"))
	write("workspaces/Demo/collections/Smoke/requests/GET-x.yml", strings.Join([]string{
		"version: 1",
		"request:",
		"  id: req",
		"  name: X",
		"  filesystemName: GET-x",
		"  requestType: http",
		"  isDraft: false",
		"  collectionId: col",
		"  collection: Smoke",
		"  folderPath: []",
		"  method: GET",
		"  url: " + baseURL + "/x",
		requestBody,
		"",
	}, "\n"))
	return root
}

// The regression this fixes: a request set to inherit used to abort the run with
// `auth error: unsupported auth type "inherit"`, so any workspace following the
// documented collection-auth pattern was unrunnable in CI.
func TestRunCLIAppliesCollectionAuthForInherit(t *testing.T) {
	httpTransports.closeAll()
	t.Cleanup(httpTransports.closeAll)

	var sawAuth string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		sawAuth = r.Header.Get("Authorization")
		fmt.Fprint(w, "{}")
	}))
	defer server.Close()

	root := writeDefaultsWorkspace(t, server.URL, strings.Join([]string{
		"    auth:",
		"      type: bearer",
		"      bearerToken: collection-token",
		"    settings: {}",
	}, "\n"), strings.Join([]string{
		"  auth:",
		"    type: inherit",
		"  bodyType: none",
		"  bodyContent: \"\"",
		"  settings: {}",
	}, "\n"))

	var out bytes.Buffer
	code := runCLI(cliOptions{workspace: root, reporters: []string{"cli"}, iterations: 1, stdout: &out, stderr: &out})
	if code != 0 {
		t.Fatalf("expected exit 0, got %d\n%s", code, out.String())
	}
	if sawAuth != "Bearer collection-token" {
		t.Errorf("Authorization = %q, want the collection's bearer token", sawAuth)
	}
}

// Inheriting with nothing to inherit must send no auth rather than fail.
func TestRunCLIInheritWithoutCollectionAuthSendsNone(t *testing.T) {
	httpTransports.closeAll()
	t.Cleanup(httpTransports.closeAll)

	var sawAuth string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		sawAuth = r.Header.Get("Authorization")
		fmt.Fprint(w, "{}")
	}))
	defer server.Close()

	root := writeDefaultsWorkspace(t, server.URL, "    settings: {}", strings.Join([]string{
		"  auth:",
		"    type: inherit",
		"  bodyType: none",
		"  bodyContent: \"\"",
		"  settings: {}",
	}, "\n"))

	var out bytes.Buffer
	if code := runCLI(cliOptions{workspace: root, reporters: []string{"cli"}, iterations: 1, stdout: &out, stderr: &out}); code != 0 {
		t.Fatalf("expected exit 0, got %d\n%s", code, out.String())
	}
	if sawAuth != "" {
		t.Errorf("Authorization = %q, want none", sawAuth)
	}
}

// A workspace that raises the script timeout or opens up pm.sendRequest has to
// behave the same in CI as it does in the app. Both settings used to be read
// only from the command line, so a run silently ignored what the collection
// (and the request) were configured with.
func TestRunCLIAppliesCollectionScriptSettings(t *testing.T) {
	httpTransports.closeAll()
	t.Cleanup(httpTransports.closeAll)

	helper := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"token":"from-helper"}`))
	}))
	defer helper.Close()

	var sawAuth string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		sawAuth = r.Header.Get("Authorization")
		fmt.Fprint(w, "{}")
	}))
	defer server.Close()

	root := writeDefaultsWorkspace(t, server.URL, strings.Join([]string{
		"    settings:",
		"      scriptTimeoutMs: 8000",
		"      allowSendRequest: true",
	}, "\n"), strings.Join([]string{
		"  auth:",
		"    type: none",
		"  bodyType: none",
		"  bodyContent: \"\"",
		"  scriptEngine: js",
		"  preRequestScriptJs: |",
		"    const start = Date.now()",
		"    while (Date.now() - start < 2400) { }",
		"    const res = pm.sendRequest(\"" + helper.URL + "/token\")",
		"    pm.request.headers.set(\"Authorization\", \"Bearer \" + res.json().token)",
		"  settings: {}",
	}, "\n"))

	var out bytes.Buffer
	code := runCLI(cliOptions{workspace: root, reporters: []string{"cli"}, iterations: 1, stdout: &out, stderr: &out})
	if code != 0 {
		t.Fatalf("expected exit 0 with the collection's script settings, got %d\n%s", code, out.String())
	}
	if sawAuth != "Bearer from-helper" {
		t.Errorf("Authorization = %q, want the token pm.sendRequest fetched", sawAuth)
	}
}

func TestRunCLIAppliesCollectionHeadersAndScripts(t *testing.T) {
	httpTransports.closeAll()
	t.Cleanup(httpTransports.closeAll)

	var sawClient, sawOwn, sawScript string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		sawClient = r.Header.Get("X-Client")
		sawOwn = r.Header.Get("X-Own")
		sawScript = r.Header.Get("X-From-Script")
		fmt.Fprint(w, "{}")
	}))
	defer server.Close()

	root := writeDefaultsWorkspace(t, server.URL, strings.Join([]string{
		"    headers:",
		"      - id: 1",
		"        enabled: true",
		"        key: X-Client",
		"        value: relay",
		"    preRequestScriptJs: |",
		"      pm.request.headers.set(\"X-From-Script\", \"collection\")",
		"    testScriptJs: |",
		"      pm.test(\"collection assertion ran\", () => pm.expect(pm.response.code).to.equal(200))",
		"    settings: {}",
	}, "\n"), strings.Join([]string{
		"  auth:",
		"    type: none",
		"  headers:",
		"    - id: 1",
		"      enabled: true",
		"      key: X-Own",
		"      value: mine",
		"  bodyType: none",
		"  bodyContent: \"\"",
		"  settings: {}",
	}, "\n"))

	var out bytes.Buffer
	code := runCLI(cliOptions{workspace: root, reporters: []string{"json"}, iterations: 1, stdout: &out, stderr: &out})
	if code != 0 {
		t.Fatalf("expected exit 0, got %d\n%s", code, out.String())
	}
	if sawClient != "relay" {
		t.Errorf("collection header missing: X-Client = %q", sawClient)
	}
	if sawOwn != "mine" {
		t.Errorf("request header lost: X-Own = %q", sawOwn)
	}
	if sawScript != "collection" {
		t.Errorf("collection pre-request script did not run: X-From-Script = %q", sawScript)
	}
	if !strings.Contains(out.String(), "collection assertion ran") {
		t.Errorf("collection test script did not run:\n%s", out.String())
	}
}

// --- merge semantics, matching the app ---

func TestMergeCollectionAuth(t *testing.T) {
	collectionAuth := cliAuth{Type: "bearer", BearerToken: "t"}

	if got := mergeCollectionAuth(collectionAuth, cliAuth{Type: "inherit"}); got.Type != "bearer" {
		t.Errorf("inherit should take the collection auth, got %q", got.Type)
	}
	// A request with its own auth always wins.
	own := cliAuth{Type: "basic", BasicUser: "u"}
	if got := mergeCollectionAuth(collectionAuth, own); got.Type != "basic" {
		t.Errorf("request auth should win, got %q", got.Type)
	}
	// Inheriting from a collection with no auth yields none, never "inherit".
	if got := mergeCollectionAuth(cliAuth{Type: "none"}, cliAuth{Type: "inherit"}); got.Type != "none" {
		t.Errorf("got %q, want none", got.Type)
	}
	if got := mergeCollectionAuth(cliAuth{}, cliAuth{Type: "inherit"}); got.Type != "none" {
		t.Errorf("got %q, want none", got.Type)
	}
	// A collection that itself says inherit must not propagate the token.
	if got := mergeCollectionAuth(cliAuth{Type: "inherit"}, cliAuth{Type: "inherit"}); got.Type != "none" {
		t.Errorf("got %q, want none", got.Type)
	}
}

func TestMergeDefaultRows(t *testing.T) {
	defaults := []cliKV{{Key: "X-Client", Value: "relay", Enabled: true}, {Key: "Accept", Value: "application/json", Enabled: true}}
	request := []cliKV{{Key: "accept", Value: "text/plain", Enabled: true}}

	merged := mergeDefaultRows(defaults, request)
	if len(merged) != 2 {
		t.Fatalf("expected 2 rows, got %#v", merged)
	}
	// The request's Accept wins, case-insensitively, and is not duplicated.
	if merged[0].Key != "X-Client" || merged[1].Key != "accept" {
		t.Errorf("unexpected merge order/content: %#v", merged)
	}
	if merged[1].Value != "text/plain" {
		t.Errorf("request header should win: %#v", merged[1])
	}
}

func TestMergeDefaultRowsSkipsBlankKeys(t *testing.T) {
	merged := mergeDefaultRows([]cliKV{{Key: "  ", Value: "x"}}, nil)
	if len(merged) != 0 {
		t.Errorf("blank keys should be dropped, got %#v", merged)
	}
}

func TestJoinScripts(t *testing.T) {
	if got := joinScripts("a", "", "  ", "b"); got != "a\n\nb" {
		t.Errorf("got %q", got)
	}
	if got := joinScripts("", ""); got != "" {
		t.Errorf("got %q, want empty", got)
	}
}

func TestMergeCollectionSettingsFillsOnlyUnset(t *testing.T) {
	yes := true
	no := false
	defaults := cliSettings{HTTPVersion: "2", TimeoutMs: 5000, EnableSSLVerification: &yes, MaxRedirects: 3}
	req := cliSettings{TimeoutMs: 1000, EnableSSLVerification: &no}

	merged := mergeCollectionSettings(defaults, req)
	if merged.TimeoutMs != 1000 {
		t.Errorf("request timeout should win, got %d", merged.TimeoutMs)
	}
	if merged.EnableSSLVerification == nil || *merged.EnableSSLVerification {
		t.Error("an explicit false on the request must not be overwritten by the default")
	}
	if merged.HTTPVersion != "2" {
		t.Errorf("unset httpVersion should come from defaults, got %q", merged.HTTPVersion)
	}
	if merged.MaxRedirects != 3 {
		t.Errorf("unset maxRedirects should come from defaults, got %d", merged.MaxRedirects)
	}
}

func TestApplyCollectionDefaultsWithoutCollection(t *testing.T) {
	req := cliSavedRequest{Auth: cliAuth{Type: "inherit"}}
	got := applyCollectionDefaults(req, nil)
	if got.Auth.Type != "none" {
		t.Errorf("a missing collection should resolve inherit to none, got %q", got.Auth.Type)
	}
}
