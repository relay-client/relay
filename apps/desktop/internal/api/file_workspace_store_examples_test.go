package api

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func exampleStorePayload(t *testing.T, examples string) string {
	t.Helper()
	return fmt.Sprintf(`{
  "version": 2,
  "activeId": "req-main",
  "activeWorkspaceId": "workspace-main",
  "openIds": ["req-main"],
  "workspaces": [
    {"id":"workspace-main","name":"Main","filesystemName":"Main"}
  ],
  "collections": [
    {"id":"collection-main","workspaceId":"workspace-main","name":"Core","filesystemName":"Core"}
  ],
  "environments": [],
  "requests": [
    {"id":"req-main","name":"Create order","filesystemName":"Create-order","requestType":"http","collectionId":"collection-main","collection":"Core","folderPath":[],"method":"POST","url":"https://api.example.test/orders","requestTab":"params","params":[],"headers":[],"auth":{"type":"none"},"bodyType":"json","rawBodyType":"json","bodyContent":"","bodyFilePath":"","bodyFileName":"","formRows":[],"preRequestScript":"","testScript":"","requestNotes":"","settings":{"timeoutMs":30000},"examples":%s}
  ],
  "history": [],
  "workspaceCookies": {}
}`, examples)
}

const createdExample = `[
  {
    "id": "ex-created",
    "requestId": "req-main",
    "name": "Created",
    "filesystemName": "created",
    "source": "captured",
    "createdAt": 1787000000000,
    "snapshot": {"method": "POST", "url": "https://api.example.test/orders", "bodyType": "json", "bodyContent": "{\"amount\":500}"},
    "response": {
      "statusCode": 201,
      "status": "201 Created",
      "bodyMediaType": "application/json",
      "body": "{\n  \"id\": \"ord_1\"\n}",
      "headers": []
    },
    "match": {"pathTemplate": "/orders"}
  }
]`

func exampleDirFor(root string) string {
	return filepath.Join(root, "workspaces", "Main", "collections", "Core", "examples", "Create-order")
}

func requestExamplesFromPayload(t *testing.T, payload string) []map[string]any {
	t.Helper()
	var decoded struct {
		Requests []map[string]any `json:"requests"`
	}
	if err := json.Unmarshal([]byte(payload), &decoded); err != nil {
		t.Fatalf("decode payload: %v", err)
	}
	if len(decoded.Requests) != 1 {
		t.Fatalf("expected one request, got %d", len(decoded.Requests))
	}
	raw, ok := decoded.Requests[0]["examples"].([]any)
	if !ok {
		return nil
	}
	out := make([]map[string]any, 0, len(raw))
	for _, item := range raw {
		if example, ok := item.(map[string]any); ok {
			out = append(out, example)
		}
	}
	return out
}

func TestExamplesRoundTripThroughWorkspace(t *testing.T) {
	withRequestStoreTestKey(t)
	dir := t.TempDir()
	localPath := filepath.Join(dir, "requests.json")
	workspaceRoot := filepath.Join(dir, "workspaces-root")

	if err := saveRelayStorePayload(localPath, workspaceRoot, exampleStorePayload(t, createdExample)); err != nil {
		t.Fatalf("save: %v", err)
	}

	exampleDir := exampleDirFor(workspaceRoot)
	bodyPath := filepath.Join(exampleDir, "created.body.json")
	body, err := os.ReadFile(bodyPath)
	if err != nil {
		t.Fatalf("read body file: %v", err)
	}
	if string(body) != "{\n  \"id\": \"ord_1\"\n}" {
		t.Errorf("body file = %q, want the response body verbatim", body)
	}

	yamlPath := filepath.Join(exampleDir, "created.yml")
	rawYAML, err := os.ReadFile(yamlPath)
	if err != nil {
		t.Fatalf("read example yaml: %v", err)
	}
	if strings.Contains(string(rawYAML), "ord_1") {
		t.Errorf("the body must live in its own file, not inside the YAML:\n%s", rawYAML)
	}
	if !strings.Contains(string(rawYAML), "bodyFile: created.body.json") {
		t.Errorf("example YAML should point at the body file, got:\n%s", rawYAML)
	}

	requestYAML, err := os.ReadFile(filepath.Join(workspaceRoot, "workspaces", "Main", "collections", "Core", "requests", "Create-order.yml"))
	if err != nil {
		t.Fatalf("read request yaml: %v", err)
	}
	if strings.Contains(string(requestYAML), "examples") {
		t.Errorf("examples must not be written inline in the request file:\n%s", requestYAML)
	}

	payload, err := loadRelayStorePayload(localPath, workspaceRoot)
	if err != nil {
		t.Fatalf("load: %v", err)
	}
	examples := requestExamplesFromPayload(t, payload)
	if len(examples) != 1 {
		t.Fatalf("expected one example after load, got %d", len(examples))
	}
	if got := examples[0]["name"]; got != "Created" {
		t.Errorf("name = %v, want Created", got)
	}
	if got := examples[0]["filesystemName"]; got != "created" {
		t.Errorf("filesystemName = %v, want created", got)
	}
	response, _ := examples[0]["response"].(map[string]any)
	if response == nil {
		t.Fatal("example came back with no response")
	}
	if got := response["body"]; got != "{\n  \"id\": \"ord_1\"\n}" {
		t.Errorf("body = %q, want it restored from the body file", got)
	}
	if _, ok := response["bodyFile"]; ok {
		t.Error("bodyFile is an on-disk detail and must not reach the frontend")
	}
}

func TestExamplesAreRemovedWithTheirBodyFile(t *testing.T) {
	withRequestStoreTestKey(t)
	dir := t.TempDir()
	localPath := filepath.Join(dir, "requests.json")
	workspaceRoot := filepath.Join(dir, "workspaces-root")

	if err := saveRelayStorePayload(localPath, workspaceRoot, exampleStorePayload(t, createdExample)); err != nil {
		t.Fatalf("save with example: %v", err)
	}
	bodyPath := filepath.Join(exampleDirFor(workspaceRoot), "created.body.json")
	if _, err := os.Stat(bodyPath); err != nil {
		t.Fatalf("body file should exist after the first save: %v", err)
	}

	if err := saveRelayStorePayload(localPath, workspaceRoot, exampleStorePayload(t, `[]`)); err != nil {
		t.Fatalf("save without example: %v", err)
	}
	if _, err := os.Stat(bodyPath); !os.IsNotExist(err) {
		t.Errorf("body file should be gone once its example is deleted, stat err = %v", err)
	}
	if _, err := os.Stat(filepath.Join(exampleDirFor(workspaceRoot), "created.yml")); !os.IsNotExist(err) {
		t.Errorf("example YAML should be gone too, stat err = %v", err)
	}
}

func TestWorkspaceWithoutExamplesLoadsUnchanged(t *testing.T) {
	withRequestStoreTestKey(t)
	dir := t.TempDir()
	localPath := filepath.Join(dir, "requests.json")
	workspaceRoot := filepath.Join(dir, "workspaces-root")

	if err := saveRelayStorePayload(localPath, workspaceRoot, relaySaveFlowPayload("/saved", "token", []string{"req-main"}, "")); err != nil {
		t.Fatalf("save: %v", err)
	}
	payload, diagnostics, err := loadRelayStorePayloadWithDiagnostics(localPath, workspaceRoot)
	if err != nil {
		t.Fatalf("load: %v", err)
	}
	if len(diagnostics) != 0 {
		t.Fatalf("unexpected diagnostics: %+v", diagnostics)
	}
	if strings.Contains(payload, `"examples"`) {
		t.Error("a workspace with no examples must not grow an examples field")
	}
}

func TestExampleBodyExtensionFollowsMediaType(t *testing.T) {
	for _, tc := range []struct{ mediaType, want string }{
		{"application/json", ".json"},
		{"application/json; charset=utf-8", ".json"},
		{"application/problem+json", ".json"},
		{"text/xml", ".xml"},
		{"application/soap+xml", ".xml"},
		{"text/html", ".html"},
		{"text/plain", ".txt"},
		{"", ".txt"},
		{"application/octet-stream", ".txt"},
	} {
		if got := exampleBodyExtension(tc.mediaType); got != tc.want {
			t.Errorf("exampleBodyExtension(%q) = %q, want %q", tc.mediaType, got, tc.want)
		}
	}
}

func TestExampleBodyFileEscapingIsRefused(t *testing.T) {
	withRequestStoreTestKey(t)
	dir := t.TempDir()
	localPath := filepath.Join(dir, "requests.json")
	workspaceRoot := filepath.Join(dir, "workspaces-root")

	if err := saveRelayStorePayload(localPath, workspaceRoot, exampleStorePayload(t, createdExample)); err != nil {
		t.Fatalf("save: %v", err)
	}
	secret := filepath.Join(dir, "secret.txt")
	if err := os.WriteFile(secret, []byte("do not read me"), 0600); err != nil {
		t.Fatalf("write bait: %v", err)
	}
	yamlPath := filepath.Join(exampleDirFor(workspaceRoot), "created.yml")
	rawYAML, err := os.ReadFile(yamlPath)
	if err != nil {
		t.Fatalf("read example: %v", err)
	}
	tampered := strings.Replace(string(rawYAML), "bodyFile: created.body.json", "bodyFile: ../../../../../secret.txt", 1)
	if tampered == string(rawYAML) {
		t.Fatal("test premise: bodyFile line not found")
	}
	if err := os.WriteFile(yamlPath, []byte(tampered), 0644); err != nil {
		t.Fatalf("write tampered example: %v", err)
	}

	payload, diagnostics, err := loadRelayStorePayloadWithDiagnostics(localPath, workspaceRoot)
	if err != nil {
		t.Fatalf("load: %v", err)
	}
	if strings.Contains(payload, "do not read me") {
		t.Fatal("a body pointer outside the example directory must not be followed")
	}
	if len(diagnostics) == 0 {
		t.Error("refusing the path should be reported, not silent")
	}
}

func TestExampleNamesAreMadeUniqueOnDisk(t *testing.T) {
	withRequestStoreTestKey(t)
	dir := t.TempDir()
	localPath := filepath.Join(dir, "requests.json")
	workspaceRoot := filepath.Join(dir, "workspaces-root")

	twoExamples := `[
    {"id":"ex-1","name":"Created","filesystemName":"created","response":{"statusCode":201,"bodyMediaType":"application/json","body":"{\"n\":1}","headers":[]}},
    {"id":"ex-2","name":"Created","filesystemName":"created","response":{"statusCode":201,"bodyMediaType":"application/json","body":"{\"n\":2}","headers":[]}}
  ]`
	if err := saveRelayStorePayload(localPath, workspaceRoot, exampleStorePayload(t, twoExamples)); err != nil {
		t.Fatalf("save: %v", err)
	}

	exampleDir := exampleDirFor(workspaceRoot)
	for _, name := range []string{"created.yml", "created.body.json", "created-1.yml", "created-1.body.json"} {
		if _, err := os.Stat(filepath.Join(exampleDir, name)); err != nil {
			t.Errorf("expected %s on disk: %v", name, err)
		}
	}

	payload, err := loadRelayStorePayload(localPath, workspaceRoot)
	if err != nil {
		t.Fatalf("load: %v", err)
	}
	examples := requestExamplesFromPayload(t, payload)
	if len(examples) != 2 {
		t.Fatalf("expected both examples back, got %d", len(examples))
	}
	bodies := map[string]bool{}
	for _, example := range examples {
		response, _ := example["response"].(map[string]any)
		bodies[fmt.Sprint(response["body"])] = true
	}
	if !bodies[`{"n":1}`] || !bodies[`{"n":2}`] {
		t.Errorf("both bodies should survive, got %v", bodies)
	}
}
