package script

import (
	"strings"
	"testing"
	"time"

	"github.com/relay-client/relay/apps/desktop/internal/model"
)

func jsPre(src string, ctx *Context) model.ScriptResult {
	return RunPreRequest(string(EngineJS), src, ctx)
}

func jsTests(src string, ctx *Context) model.ScriptResult {
	return RunTests(string(EngineJS), src, ctx)
}

func TestJSModernSyntaxAndVariables(t *testing.T) {
	ctx := NewContext(nil, nil)
	res := jsPre(`
const base = "https://api.example.com";
let parts = ["v", "2"];
const joined = parts.map(p => p.toUpperCase()).join("-");
pm.variables.set("base", base);
pm.variables.set("joined", joined);
pm.variables.set("count", 42);
`, ctx)
	if res.Error != "" {
		t.Fatalf("unexpected error: %s", res.Error)
	}
	if ctx.Variables["base"] != "https://api.example.com" {
		t.Fatalf("base = %q", ctx.Variables["base"])
	}
	if ctx.Variables["joined"] != "V-2" {
		t.Fatalf("joined = %q", ctx.Variables["joined"])
	}
	if ctx.Variables["count"] != "42" {
		t.Fatalf("count = %q (numbers should be stringified)", ctx.Variables["count"])
	}
}

func TestJSEnvironmentGetSetUnsetClear(t *testing.T) {
	ctx := NewContext(nil, map[string]string{"token": "secret", "keep": "yes"})
	res := jsPre(`
pm.variables.set("echo", pm.environment.get("token"));
pm.environment.set("added", "new");
pm.environment.unset("keep");
`, ctx)
	if res.Error != "" {
		t.Fatalf("unexpected error: %s", res.Error)
	}
	if ctx.Variables["echo"] != "secret" {
		t.Fatalf("echo = %q", ctx.Variables["echo"])
	}
	if ctx.Environment["added"] != "new" {
		t.Fatalf("added missing: %+v", ctx.Environment)
	}
	if _, ok := ctx.Environment["keep"]; ok {
		t.Fatalf("keep should have been unset: %+v", ctx.Environment)
	}
}

func TestJSMissingValueIsUndefined(t *testing.T) {
	ctx := NewContext(nil, nil)
	res := jsPre(`
pm.variables.set("missingIsUndefined", String(pm.environment.get("nope") === undefined));
`, ctx)
	if res.Error != "" {
		t.Fatalf("unexpected error: %s", res.Error)
	}
	if ctx.Variables["missingIsUndefined"] != "true" {
		t.Fatalf("expected undefined for missing key, got %q", ctx.Variables["missingIsUndefined"])
	}
}

func TestJSRequestMutation(t *testing.T) {
	ctx := NewContext(nil, nil)
	ctx.RequestURL = "https://old.example.com"
	ctx.RequestMethod = "GET"
	ctx.RequestHeaders["X-Existing"] = "1"

	res := jsPre(`
pm.variables.set("origUrl", pm.request.url);
pm.variables.set("method", pm.request.method);
pm.request.set_url("https://new.example.com");
pm.request.headers.set("X-Token", "abc");
pm.request.headers.unset("X-Existing");
pm.request.params.set("page", "2");
`, ctx)
	if res.Error != "" {
		t.Fatalf("unexpected error: %s", res.Error)
	}
	if ctx.Variables["origUrl"] != "https://old.example.com" {
		t.Fatalf("origUrl = %q", ctx.Variables["origUrl"])
	}
	if ctx.Variables["method"] != "GET" {
		t.Fatalf("method = %q", ctx.Variables["method"])
	}
	if ctx.RequestURL != "https://new.example.com" {
		t.Fatalf("url not updated: %q", ctx.RequestURL)
	}
	if ctx.RequestHeaders["X-Token"] != "abc" {
		t.Fatalf("header not set: %+v", ctx.RequestHeaders)
	}
	if _, removed := ctx.RemovedHeaders["x-existing"]; !removed {
		t.Fatalf("X-Existing should be marked removed: %+v", ctx.RemovedHeaders)
	}
	if ctx.RequestParams["page"] != "2" {
		t.Fatalf("param not set: %+v", ctx.RequestParams)
	}
}

func TestJSResponseJSONAndDotAccess(t *testing.T) {
	ctx := NewContext(nil, nil)
	ctx.Response = &model.HttpResponse{
		StatusCode: 200,
		Status:     "200 OK",
		Duration:   123,
		Size:       456,
		Body:       `{"id": 7, "user": {"name": "ann"}, "tags": ["a", "b"]}`,
		Headers:    []model.KeyValue{{Key: "Content-Type", Value: "application/json"}},
	}

	res := jsTests(`
const data = pm.response.json();
pm.variables.set("id", String(data.id));
pm.variables.set("name", data.user.name);
pm.variables.set("tag0", data.tags[0]);
pm.variables.set("code", String(pm.response.code));
pm.variables.set("rt", String(pm.response.responseTime));
pm.variables.set("ct", pm.response.headers.get("content-type"));
`, ctx)
	if res.Error != "" {
		t.Fatalf("unexpected error: %s", res.Error)
	}
	checks := map[string]string{"id": "7", "name": "ann", "tag0": "a", "code": "200", "rt": "123", "ct": "application/json"}
	for k, want := range checks {
		if ctx.Variables[k] != want {
			t.Fatalf("%s = %q, want %q", k, ctx.Variables[k], want)
		}
	}
}

func TestJSTestCallbackPassAndFail(t *testing.T) {
	ctx := NewContext(nil, nil)
	ctx.Response = &model.HttpResponse{StatusCode: 200, Body: `{"ok": true}`, Duration: 10}

	res := jsTests(`
pm.test("status is 200", function () {
  pm.response.to.have.status(200);
  pm.expect(pm.response.code).to.eql(200);
});
pm.test("response time ok", () => pm.expect(pm.response.responseTime).to.be.below(1000));
pm.test("deliberately fails", function () {
  pm.expect(pm.response.code).to.equal(404);
});
`, ctx)
	if res.Error != "" {
		t.Fatalf("unexpected script error: %s", res.Error)
	}
	if len(res.Tests) != 3 {
		t.Fatalf("expected 3 tests, got %d: %+v", len(res.Tests), res.Tests)
	}
	if !res.Tests[0].Passed || !res.Tests[1].Passed {
		t.Fatalf("tests 0/1 should pass: %+v", res.Tests)
	}
	if res.Tests[2].Passed {
		t.Fatalf("test 2 should fail")
	}
	if !strings.Contains(res.Tests[2].Error, "404") {
		t.Fatalf("failure message should mention expected value: %q", res.Tests[2].Error)
	}
}

func TestJSTestBooleanFormParity(t *testing.T) {
	ctx := NewContext(nil, nil)
	ctx.Response = &model.HttpResponse{StatusCode: 201}
	res := jsTests(`
pm.test("bool pass", pm.response.code === 201);
pm.test("bool fail", pm.response.code === 200);
`, ctx)
	if res.Error != "" {
		t.Fatalf("unexpected error: %s", res.Error)
	}
	if len(res.Tests) != 2 || !res.Tests[0].Passed || res.Tests[1].Passed {
		t.Fatalf("boolean form parity broken: %+v", res.Tests)
	}
}

func TestJSChaiMatchers(t *testing.T) {
	ctx := NewContext(nil, nil)
	res := jsTests(`
pm.test("deep eql", () => pm.expect({a: [1, 2], b: "x"}).to.eql({a: [1, 2], b: "x"}));
pm.test("a type", () => pm.expect([1]).to.be.an("array"));
pm.test("include array", () => pm.expect([1, 2, 3]).to.include(2));
pm.test("include string", () => pm.expect("hello world").to.include("world"));
pm.test("have property", () => pm.expect({id: 1}).to.have.property("id"));
pm.test("above/below", () => { pm.expect(5).to.be.above(3); pm.expect(5).to.be.below(9); });
pm.test("not negation", () => pm.expect(1).to.not.equal(2));
pm.test("lengthOf", () => pm.expect([1, 2, 3]).to.have.lengthOf(3));
pm.test("oneOf", () => pm.expect("b").to.be.oneOf(["a", "b", "c"]));
`, ctx)
	if res.Error != "" {
		t.Fatalf("unexpected error: %s", res.Error)
	}
	for _, tr := range res.Tests {
		if !tr.Passed {
			t.Fatalf("matcher test failed: %s -> %s", tr.Name, tr.Error)
		}
	}
	if len(res.Tests) != 9 {
		t.Fatalf("expected 9 matcher tests, got %d", len(res.Tests))
	}
}

func TestJSLogging(t *testing.T) {
	ctx := NewContext(nil, nil)
	res := jsPre(`
console.log("hello", 42, {a: 1});
pm.log("via pm.log");
`, ctx)
	if res.Error != "" {
		t.Fatalf("unexpected error: %s", res.Error)
	}
	if len(ctx.Logs) != 2 {
		t.Fatalf("expected 2 logs, got %d: %+v", len(ctx.Logs), ctx.Logs)
	}
	if ctx.Logs[0] != `hello 42 {"a":1}` {
		t.Fatalf("log0 = %q", ctx.Logs[0])
	}
	if ctx.Logs[1] != "via pm.log" {
		t.Fatalf("log1 = %q", ctx.Logs[1])
	}
}

func TestJSTimesOut(t *testing.T) {
	previous := scriptExecutionTimeout
	scriptExecutionTimeout = 20 * time.Millisecond
	t.Cleanup(func() { scriptExecutionTimeout = previous })

	start := time.Now()
	res := jsPre(`while (true) {}`, NewContext(nil, nil))
	if !strings.Contains(res.Error, "timed out") {
		t.Fatalf("expected timeout error, got %q", res.Error)
	}
	if elapsed := time.Since(start); elapsed > 2*time.Second {
		t.Fatalf("timeout took too long: %s", elapsed)
	}
}

func TestJSRejectsOversizedScripts(t *testing.T) {
	res := jsPre(strings.Repeat("a", scriptMaxSourceBytes+1), NewContext(nil, nil))
	if res.Error != "script is too large" {
		t.Fatalf("expected source size guard, got %q", res.Error)
	}
}

func TestJSLimitsRecursiveCallStack(t *testing.T) {
	start := time.Now()
	res := jsPre(`function recur() { return recur(); } recur();`, NewContext(nil, nil))
	if res.Error == "" {
		t.Fatal("expected recursive script to fail")
	}
	if elapsed := time.Since(start); elapsed > time.Second {
		t.Fatalf("recursive script took too long: %s", elapsed)
	}
}

func TestJSSandboxBlocksRequireAndImport(t *testing.T) {
	ctx := NewContext(nil, nil)
	res := jsPre(`var fs = require("fs");`, ctx)
	if res.Error == "" || !strings.Contains(res.Error, "require") {
		t.Fatalf("require should be unavailable, got %q", res.Error)
	}

	res2 := jsPre(`process.exit(1);`, NewContext(nil, nil))
	if res2.Error == "" || !strings.Contains(res2.Error, "process") {
		t.Fatalf("process should be unavailable, got %q", res2.Error)
	}
}

func TestJSSyntaxErrorReported(t *testing.T) {
	res := jsPre(`this is not valid javascript {{{`, NewContext(nil, nil))
	if res.Error == "" {
		t.Fatalf("expected a syntax error message")
	}
}

func TestJSEmptyScriptNoop(t *testing.T) {
	res := jsPre("   \n  ", NewContext(nil, nil))
	if res.Error != "" {
		t.Fatalf("empty script should be a no-op, got %q", res.Error)
	}
}
