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

func TestLoadDataFileCSV(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "data.csv")
	os.WriteFile(path, []byte("user,role\nada,admin\ngrace,\"eng, lead\"\n"), 0o644)

	rows, err := loadDataFile(path)
	if err != nil {
		t.Fatalf("load: %v", err)
	}
	if len(rows) != 2 {
		t.Fatalf("expected 2 rows, got %d", len(rows))
	}
	if rows[0]["user"] != "ada" || rows[0]["role"] != "admin" {
		t.Fatalf("row 0 = %v", rows[0])
	}
	if rows[1]["role"] != "eng, lead" {
		t.Fatalf("expected quoted comma to survive, got %q", rows[1]["role"])
	}
}

func TestLoadDataFileJSON(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "data.json")
	os.WriteFile(path, []byte(`[{"id":1,"active":true},{"id":2,"active":false}]`), 0o644)

	rows, err := loadDataFile(path)
	if err != nil {
		t.Fatalf("load: %v", err)
	}
	if len(rows) != 2 {
		t.Fatalf("expected 2 rows, got %d", len(rows))
	}
	// Numbers and booleans become strings usable in {{templates}}.
	if rows[0]["id"] != "1" || rows[0]["active"] != "true" {
		t.Fatalf("row 0 = %v", rows[0])
	}
	if rows[1]["id"] != "2" || rows[1]["active"] != "false" {
		t.Fatalf("row 1 = %v", rows[1])
	}
}

func TestLoadDataFileWrapsAndRejects(t *testing.T) {
	dir := t.TempDir()
	wrapped := filepath.Join(dir, "d.json")
	os.WriteFile(wrapped, []byte(`{"data":[{"a":"1"}]}`), 0o644)
	if rows, err := loadDataFile(wrapped); err != nil || len(rows) != 1 || rows[0]["a"] != "1" {
		t.Fatalf("wrapped rows = %v err = %v", rows, err)
	}

	empty := filepath.Join(dir, "empty.csv")
	os.WriteFile(empty, []byte("only_header\n"), 0o644)
	if _, err := loadDataFile(empty); err == nil {
		t.Fatal("expected an error for a header-only CSV")
	}
}

// Every dynamic variable must produce a non-empty, brace-free value — the same
// contract the frontend test enforces, so the CLI stays at parity.
func TestDynamicGeneratorsParity(t *testing.T) {
	for name, gen := range dynamicGenerators {
		value := gen()
		if value == "" {
			t.Errorf("%s produced an empty value", name)
		}
		if strings.Contains(value, "{{") {
			t.Errorf("%s produced an unresolved value %q", name, value)
		}
	}
	// A representative shape check.
	if v, _ := resolveDynamicCLIVariable("$guid"); len(v) != 36 {
		t.Errorf("$guid = %q", v)
	}
	if _, ok := resolveDynamicCLIVariable("$notAThing"); ok {
		t.Error("expected an unknown dynamic variable to be reported as such")
	}
}

func TestReadVariableFilePostmanEnvironment(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "env.json")
	os.WriteFile(path, []byte(`{"name":"CI","values":[{"key":"token","value":"abc","enabled":true},{"key":"skip","value":"x","enabled":false}]}`), 0o644)

	values, err := readVariableFile(path)
	if err != nil {
		t.Fatalf("read: %v", err)
	}
	if values["token"] != "abc" {
		t.Fatalf("token = %q", values["token"])
	}
	if _, ok := values["skip"]; ok {
		t.Fatal("expected a disabled value to be skipped")
	}
}

func TestWriteVariableExportRoundTrips(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "out.json")
	if err := writeVariableExport(path, "CI", map[string]string{"a": "1", "b": "2"}); err != nil {
		t.Fatalf("export: %v", err)
	}
	// The export is a Postman-style environment that reads back through the loader.
	values, err := readVariableFile(path)
	if err != nil {
		t.Fatalf("read back: %v", err)
	}
	if values["a"] != "1" || values["b"] != "2" {
		t.Fatalf("round-trip = %v", values)
	}
}

// writeDataDrivenWorkspace lays down a workspace whose request uses a data
// column both in the URL ({{user}}) and via pm.iterationData in a test.
func writeDataDrivenWorkspace(t *testing.T, baseURL string) string {
	t.Helper()
	root := t.TempDir()
	write := func(rel, content string) {
		path := filepath.Join(root, rel)
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			t.Fatalf("mkdir: %v", err)
		}
		if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
			t.Fatalf("write: %v", err)
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
		"    settings: {}",
		"",
	}, "\n"))
	write("workspaces/Demo/environments/Local.yml", strings.Join([]string{
		"version: 1",
		"environment:",
		"  id: env",
		"  workspaceId: ws",
		"  name: Local",
		"  filesystemName: Local",
		"  values:",
		"    - id: 1",
		"      enabled: true",
		"      key: baseUrl",
		"      value: " + baseURL,
		"",
	}, "\n"))
	write("workspaces/Demo/collections/Smoke/requests/GET-user.yml", strings.Join([]string{
		"version: 1",
		"request:",
		"  id: req",
		"  name: User",
		"  filesystemName: GET-user",
		"  requestType: http",
		"  isDraft: false",
		"  collectionId: col",
		"  collection: Smoke",
		"  folderPath: []",
		"  method: GET",
		"  url: \"{{baseUrl}}/u?name={{user}}\"",
		"  auth:",
		"    type: none",
		"  bodyType: none",
		"  bodyContent: \"\"",
		"  testScriptJs: |",
		"    pm.test(\"url carries the row value\", () => pm.expect(pm.request.url).to.include(\"name=\"))",
		"    pm.test(\"iterationData is readable\", () => pm.expect(pm.iterationData.get(\"user\")).to.not.equal(undefined))",
		"  settings: {}",
		"",
	}, "\n"))
	return root
}

func TestRunCLIDataDrivenIterations(t *testing.T) {
	httpTransports.closeAll()
	t.Cleanup(httpTransports.closeAll)

	var seen []string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seen = append(seen, r.URL.Query().Get("name"))
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("{}"))
	}))
	defer server.Close()

	root := writeDataDrivenWorkspace(t, server.URL)
	dataPath := filepath.Join(t.TempDir(), "users.csv")
	os.WriteFile(dataPath, []byte("user\nada\ngrace\nlinus\n"), 0o644)

	var out bytes.Buffer
	code := runCLI(cliOptions{
		workspace: root, env: "Local", reporters: []string{"json"},
		dataFile: dataPath, iterations: 1, stdout: &out, stderr: &out,
	})
	if code != 0 {
		t.Fatalf("expected exit 0, got %d\n%s", code, out.String())
	}
	// One iteration per data row, in order, each carrying its own value.
	if strings.Join(seen, ",") != "ada,grace,linus" {
		t.Fatalf("expected one request per row with its value, got %v", seen)
	}

	var payload struct {
		Summary struct {
			Requests   int `json:"requests"`
			Assertions int `json:"assertions"`
		} `json:"summary"`
	}
	json.Unmarshal(out.Bytes(), &payload)
	if payload.Summary.Requests != 3 || payload.Summary.Assertions != 6 {
		t.Fatalf("unexpected summary: %+v", payload.Summary)
	}
}

func TestRunCLIReporterFileExports(t *testing.T) {
	httpTransports.closeAll()
	t.Cleanup(httpTransports.closeAll)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("{}"))
	}))
	defer server.Close()

	root := writeDataDrivenWorkspace(t, server.URL)
	dataPath := filepath.Join(t.TempDir(), "u.csv")
	os.WriteFile(dataPath, []byte("user\nada\n"), 0o644)

	outDir := t.TempDir()
	jsonPath := filepath.Join(outDir, "report.json")
	junitPath := filepath.Join(outDir, "report.xml")
	envPath := filepath.Join(outDir, "env.json")

	var out bytes.Buffer
	code := runCLI(cliOptions{
		workspace: root, env: "Local", reporters: []string{"cli", "json", "junit"},
		reporterJSONExport: jsonPath, reporterJUnitExport: junitPath, exportEnvironment: envPath,
		dataFile: dataPath, iterations: 1, stdout: &out, stderr: &out,
	})
	if code != 0 {
		t.Fatalf("expected exit 0, got %d\n%s", code, out.String())
	}
	// The CLI reporter went to stdout; the others went to files.
	if !strings.Contains(out.String(), "1 requests, 1 passed") {
		t.Fatalf("expected the cli summary on stdout, got:\n%s", out.String())
	}
	jsonReport, err := os.ReadFile(jsonPath)
	if err != nil || !strings.Contains(string(jsonReport), `"ok": true`) {
		t.Fatalf("json export missing or wrong: %v\n%s", err, jsonReport)
	}
	junitReport, err := os.ReadFile(junitPath)
	if err != nil || !strings.Contains(string(junitReport), "<testsuite ") {
		t.Fatalf("junit export missing or wrong: %v\n%s", err, junitReport)
	}
	envExport, err := os.ReadFile(envPath)
	if err != nil || !strings.Contains(string(envExport), "baseUrl") {
		t.Fatalf("environment export missing or wrong: %v\n%s", err, envExport)
	}
}

func TestRunCLIInsecureFlagDisablesVerification(t *testing.T) {
	httpTransports.closeAll()
	t.Cleanup(httpTransports.closeAll)

	// A TLS server with a self-signed cert: it only succeeds when verification
	// is off, which is what --insecure does.
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("{}"))
	}))
	defer server.Close()

	root := writeDataDrivenWorkspace(t, server.URL)
	dataPath := filepath.Join(t.TempDir(), "u.csv")
	os.WriteFile(dataPath, []byte("user\nada\n"), 0o644)

	var out bytes.Buffer
	code := runCLI(cliOptions{
		workspace: root, env: "Local", reporters: []string{"cli"},
		insecure: true, dataFile: dataPath, iterations: 1, stdout: &out, stderr: &out,
	})
	if code != 0 {
		t.Fatalf("expected --insecure to let the self-signed request through, got exit %d\n%s", code, out.String())
	}
}
