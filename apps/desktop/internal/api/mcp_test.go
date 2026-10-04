package api

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/stormhop/kurlo/apps/desktop/internal/api/state"
	"github.com/stormhop/kurlo/apps/desktop/internal/model"
)

type mcpCapturedRequest struct {
	headers http.Header
	body    map[string]any
}

func mcpTestServer(t *testing.T, handler func(w http.ResponseWriter, captured mcpCapturedRequest)) (*httptest.Server, *mcpCapturedRequest) {
	t.Helper()
	captured := &mcpCapturedRequest{}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		raw, _ := io.ReadAll(r.Body)
		captured.headers = r.Header.Clone()
		captured.body = map[string]any{}
		_ = json.Unmarshal(raw, &captured.body)
		handler(w, *captured)
	}))
	t.Cleanup(server.Close)
	return server, captured
}

func mcpJSONResult(w http.ResponseWriter, result string) {
	w.Header().Set("Content-Type", "application/json")
	fmt.Fprintf(w, `{"jsonrpc":"2.0","id":1,"result":%s}`, result)
}

func sendTestMcp(t *testing.T, req model.HttpRequest) model.McpResponse {
	t.Helper()
	prepared, warnings, err := mcpPrepareRequest(req, 1)
	if err != nil {
		return model.NormalizeMcpResponse(model.McpResponse{Error: err.Error()})
	}
	httpResponse := sendRequest(t.Context(), prepared, state.New(), newCookieJarRegistry(), newPreflightCache())
	return model.NormalizeMcpResponse(mcpResponseFrom(prepared, httpResponse, warnings))
}

func mcpParams(t *testing.T, captured mcpCapturedRequest) map[string]any {
	t.Helper()
	params, ok := captured.body["params"].(map[string]any)
	if !ok {
		t.Fatalf("the request body carried no params: %+v", captured.body)
	}
	return params
}

func TestMcpSendsTheEnvelopeAndTheMirroredHeaders(t *testing.T) {
	server, captured := mcpTestServer(t, func(w http.ResponseWriter, _ mcpCapturedRequest) {
		mcpJSONResult(w, `{"resultType":"complete","content":[{"type":"text","text":"72F"}]}`)
	})

	resp := sendTestMcp(t, model.HttpRequest{
		URL:          server.URL,
		McpMethod:    mcpMethodToolsCall,
		McpName:      "get_weather",
		McpArguments: `{"location":"Seattle"}`,
	})
	if resp.Error != "" {
		t.Fatalf("send: %s", resp.Error)
	}

	if got := captured.headers.Get("Mcp-Method"); got != "tools/call" {
		t.Errorf("Mcp-Method = %q", got)
	}
	if got := captured.headers.Get("Mcp-Name"); got != "get_weather" {
		t.Errorf("Mcp-Name = %q", got)
	}
	if got := captured.headers.Get("MCP-Protocol-Version"); got != model.McpDefaultProtocolVersion {
		t.Errorf("MCP-Protocol-Version = %q, want %q", got, model.McpDefaultProtocolVersion)
	}
	accept := captured.headers.Get("Accept")
	if !strings.Contains(accept, "application/json") || !strings.Contains(accept, "text/event-stream") {
		t.Errorf("Accept = %q, must offer both a JSON object and a stream", accept)
	}

	params := mcpParams(t, *captured)
	if params["name"] != "get_weather" {
		t.Errorf("params.name = %v", params["name"])
	}
	meta, ok := params["_meta"].(map[string]any)
	if !ok {
		t.Fatal("params carried no _meta")
	}
	if meta[mcpMetaProtocolVersion] != model.McpDefaultProtocolVersion {
		t.Errorf("_meta protocol version = %v", meta[mcpMetaProtocolVersion])
	}
	if meta[mcpMetaProtocolVersion] != captured.headers.Get("MCP-Protocol-Version") {
		t.Error("the header and the body must agree, or a conforming server rejects the request")
	}
	if _, declared := meta[mcpMetaClientCaps].(map[string]any)["sampling"]; declared {
		t.Error("Kurlo has no model and must never declare the sampling capability")
	}

	if len(resp.Content) != 1 || resp.Content[0].Text != "72F" {
		t.Errorf("content = %+v", resp.Content)
	}
	if resp.ResultType != "complete" {
		t.Errorf("resultType = %q", resp.ResultType)
	}
}

func TestMcpReadsAStreamedAnswer(t *testing.T) {
	server, _ := mcpTestServer(t, func(w http.ResponseWriter, _ mcpCapturedRequest) {
		w.Header().Set("Content-Type", "text/event-stream")
		w.WriteHeader(http.StatusOK)
		fmt.Fprint(w, ": keep-alive\n\n")
		fmt.Fprint(w, "event: message\ndata: {\"jsonrpc\":\"2.0\",\"method\":\"notifications/progress\",\"params\":{\"progress\":1}}\n\n")
		fmt.Fprint(w, "data: {\"jsonrpc\":\"2.0\",\"method\":\"notifications/progress\",\"params\":{\"progress\":2}}\n\n")
		fmt.Fprint(w, "data: {\"jsonrpc\":\"2.0\",\"id\":1,\"result\":{\"resultType\":\"complete\",\"content\":[{\"type\":\"text\",\"text\":\"done\"}]}}\n\n")
	})

	resp := sendTestMcp(t, model.HttpRequest{
		URL:       server.URL,
		McpMethod: mcpMethodToolsCall,
		McpName:   "slow_tool",
	})
	if resp.Error != "" {
		t.Fatalf("send: %s", resp.Error)
	}
	if len(resp.Notifications) != 2 {
		t.Errorf("notifications = %+v, want the two progress frames", resp.Notifications)
	}
	if len(resp.Content) != 1 || resp.Content[0].Text != "done" {
		t.Errorf("the final response was not read off the stream: %+v", resp.Content)
	}
	if !strings.Contains(resp.HTTP.Body, "notifications/progress") {
		t.Error("the raw stream must remain readable in the HTTP body")
	}
}

func TestMcpStreamedAnswerIsNotRefusedAsSSE(t *testing.T) {
	server, _ := mcpTestServer(t, func(w http.ResponseWriter, _ mcpCapturedRequest) {
		w.Header().Set("Content-Type", "text/event-stream")
		fmt.Fprint(w, "data: {\"jsonrpc\":\"2.0\",\"id\":1,\"result\":{\"resultType\":\"complete\"}}\n\n")
	})

	resp := sendTestMcp(t, model.HttpRequest{URL: server.URL, McpMethod: mcpMethodToolsList})
	if strings.Contains(resp.HTTP.Error, "Switch to SSE mode") {
		t.Fatal("an MCP call must consume a streamed answer itself, not send the user to SSE mode")
	}
	if resp.ResultType != "complete" {
		t.Errorf("resultType = %q", resp.ResultType)
	}
}

func TestMcpListsToolsWithTheirSchemas(t *testing.T) {
	server, captured := mcpTestServer(t, func(w http.ResponseWriter, _ mcpCapturedRequest) {
		mcpJSONResult(w, `{
			"resultType":"complete",
			"tools":[{
				"name":"get_weather",
				"title":"Weather",
				"description":"Current weather",
				"inputSchema":{"type":"object","properties":{"location":{"type":"string"}},"required":["location"]},
				"outputSchema":{"type":"object","properties":{"temperature":{"type":"number"}}}
			}],
			"nextCursor":"page-2",
			"ttlMs":300000,
			"cacheScope":"public"
		}`)
	})

	resp := sendTestMcp(t, model.HttpRequest{
		URL:       server.URL,
		McpMethod: mcpMethodToolsList,
		McpCursor: "page-1",
	})
	if resp.Error != "" {
		t.Fatalf("send: %s", resp.Error)
	}
	if len(resp.Tools) != 1 {
		t.Fatalf("tools = %+v", resp.Tools)
	}
	tool := resp.Tools[0]
	if tool.Name != "get_weather" || tool.Title != "Weather" {
		t.Errorf("tool = %+v", tool)
	}
	if !strings.Contains(tool.InputSchema, "location") {
		t.Errorf("input schema was not carried through: %q", tool.InputSchema)
	}
	if !strings.Contains(tool.OutputSchema, "temperature") {
		t.Errorf("output schema was not carried through: %q", tool.OutputSchema)
	}
	if tool.Rejected != "" {
		t.Errorf("a valid tool must not be rejected: %q", tool.Rejected)
	}
	if resp.NextCursor != "page-2" || resp.TTLMs != 300000 || resp.CacheScope != "public" {
		t.Errorf("paging and caching hints were dropped: %+v", resp)
	}
	if mcpParams(t, *captured)["cursor"] != "page-1" {
		t.Error("the cursor was not sent")
	}
	if captured.headers.Get("Mcp-Name") != "" {
		t.Error("tools/list carries no name, so it must not send an Mcp-Name header")
	}
}

func TestMcpReadsTheServerIdentity(t *testing.T) {
	server, _ := mcpTestServer(t, func(w http.ResponseWriter, _ mcpCapturedRequest) {
		mcpJSONResult(w, `{
			"resultType":"complete",
			"supportedVersions":["2026-07-28"],
			"capabilities":{"tools":{},"resources":{}},
			"instructions":"Weather utilities.",
			"_meta":{"io.modelcontextprotocol/serverInfo":{"name":"ExampleServer","version":"1.2.3"}}
		}`)
	})

	resp := sendTestMcp(t, model.HttpRequest{URL: server.URL, McpMethod: mcpMethodDiscover})
	if resp.ServerName != "ExampleServer" || resp.ServerVersion != "1.2.3" {
		t.Errorf("server identity = %q %q", resp.ServerName, resp.ServerVersion)
	}
	if len(resp.SupportedVersions) != 1 || resp.SupportedVersions[0] != "2026-07-28" {
		t.Errorf("supportedVersions = %v", resp.SupportedVersions)
	}
	if strings.Join(resp.Capabilities, ",") != "resources,tools" {
		t.Errorf("capabilities = %v, want them sorted and named", resp.Capabilities)
	}
	if resp.Instructions != "Weather utilities." {
		t.Errorf("instructions = %q", resp.Instructions)
	}
}

func TestMcpMirrorsToolParametersIntoHeaders(t *testing.T) {
	server, captured := mcpTestServer(t, func(w http.ResponseWriter, _ mcpCapturedRequest) {
		mcpJSONResult(w, `{"resultType":"complete"}`)
	})

	resp := sendTestMcp(t, model.HttpRequest{
		URL:       server.URL,
		McpMethod: mcpMethodToolsCall,
		McpName:   "execute_sql",
		McpInputSchema: `{"type":"object","properties":{
			"region":{"type":"string","x-mcp-header":"Region"},
			"dryRun":{"type":"boolean","x-mcp-header":"DryRun"},
			"attempt":{"type":"integer","x-mcp-header":"Attempt"},
			"query":{"type":"string"}
		}}`,
		McpArguments: `{"region":"us-west1","dryRun":false,"attempt":3,"query":"SELECT 1"}`,
	})
	if resp.Error != "" {
		t.Fatalf("send: %s", resp.Error)
	}
	if got := captured.headers.Get("Mcp-Param-Region"); got != "us-west1" {
		t.Errorf("Mcp-Param-Region = %q", got)
	}
	if got := captured.headers.Get("Mcp-Param-DryRun"); got != "false" {
		t.Errorf("Mcp-Param-DryRun = %q, want the boolean spelled out", got)
	}
	if got := captured.headers.Get("Mcp-Param-Attempt"); got != "3" {
		t.Errorf("Mcp-Param-Attempt = %q, want a decimal integer", got)
	}
	if captured.headers.Get("Mcp-Param-Query") != "" {
		t.Error("an unannotated parameter must not be mirrored")
	}
}

func TestMcpEncodesAHeaderValueThatIsNotPlainASCII(t *testing.T) {
	server, captured := mcpTestServer(t, func(w http.ResponseWriter, _ mcpCapturedRequest) {
		mcpJSONResult(w, `{"resultType":"complete"}`)
	})

	sendTestMcp(t, model.HttpRequest{
		URL:            server.URL,
		McpMethod:      mcpMethodToolsCall,
		McpName:        "поиск",
		McpInputSchema: `{"type":"object","properties":{"city":{"type":"string","x-mcp-header":"City"}}}`,
		McpArguments:   `{"city":"Hello, 世界"}`,
	})

	name := captured.headers.Get("Mcp-Name")
	if !strings.HasPrefix(name, "=?base64?") {
		t.Errorf("Mcp-Name = %q, a non-ASCII name must use the base64 sentinel", name)
	}
	if decoded := mcpDecodeHeaderValue(name); decoded != "поиск" {
		t.Errorf("Mcp-Name decodes to %q", decoded)
	}
	city := captured.headers.Get("Mcp-Param-City")
	if decoded := mcpDecodeHeaderValue(city); decoded != "Hello, 世界" {
		t.Errorf("Mcp-Param-City = %q, decodes to %q", city, decoded)
	}
}

func TestMcpRefusesAToolWhoseHeaderAnnotationIsInvalid(t *testing.T) {
	cases := []struct {
		name   string
		schema string
		want   string
	}{
		{
			name:   "a header name that is not a token",
			schema: `{"type":"object","properties":{"a":{"type":"string","x-mcp-header":"Bad Header"}}}`,
			want:   "not a valid HTTP header name",
		},
		{
			name:   "a header name carrying a newline",
			schema: `{"type":"object","properties":{"a":{"type":"string","x-mcp-header":"X\nInjected"}}}`,
			want:   "not a valid HTTP header name",
		},
		{
			name: "two parameters claiming one header",
			schema: `{"type":"object","properties":{
				"a":{"type":"string","x-mcp-header":"Region"},
				"b":{"type":"string","x-mcp-header":"region"}
			}}`,
			want: "is used by both",
		},
		{
			name:   "an annotation on a non-primitive",
			schema: `{"type":"object","properties":{"a":{"type":"number","x-mcp-header":"Amount"}}}`,
			want:   "must name a string, integer or boolean",
		},
		{
			name:   "an annotation the client can never reach",
			schema: `{"type":"object","properties":{"a":{"type":"array","items":{"type":"string","x-mcp-header":"Item"}}}}`,
			want:   "does not allow it to be read from",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			reason := McpToolRejection(tc.schema)
			if !strings.Contains(reason, tc.want) {
				t.Errorf("rejection = %q, want it to mention %q", reason, tc.want)
			}

			resp := sendTestMcp(t, model.HttpRequest{
				URL:            "http://127.0.0.1:1/never-reached",
				McpMethod:      mcpMethodToolsCall,
				McpName:        "bad_tool",
				McpInputSchema: tc.schema,
			})
			if !strings.Contains(resp.Error, "cannot be called") {
				t.Errorf("the call must be refused before it is sent, got %q", resp.Error)
			}
		})
	}
}

func TestMcpWarnsWhenStructuredContentContradictsTheOutputSchema(t *testing.T) {
	server, _ := mcpTestServer(t, func(w http.ResponseWriter, _ mcpCapturedRequest) {
		mcpJSONResult(w, `{
			"resultType":"complete",
			"content":[{"type":"text","text":"{\"temperature\":\"warm\"}"}],
			"structuredContent":{"temperature":"warm"}
		}`)
	})

	resp := sendTestMcp(t, model.HttpRequest{
		URL:             server.URL,
		McpMethod:       mcpMethodToolsCall,
		McpName:         "get_weather_data",
		McpOutputSchema: `{"type":"object","properties":{"temperature":{"type":"number"}},"required":["temperature"]}`,
	})
	if resp.Error != "" {
		t.Fatalf("send: %s", resp.Error)
	}
	joined := strings.Join(resp.Warnings, " ")
	if !strings.Contains(joined, "structuredContent does not match") {
		t.Errorf("warnings = %v, want the contradiction named", resp.Warnings)
	}
	if resp.StructuredContent == "" {
		t.Error("the structured content must still be shown — the server is at fault, not the user")
	}
}

func TestMcpAcceptsStructuredContentThatMatchesTheOutputSchema(t *testing.T) {
	server, _ := mcpTestServer(t, func(w http.ResponseWriter, _ mcpCapturedRequest) {
		mcpJSONResult(w, `{"resultType":"complete","structuredContent":{"temperature":22.5}}`)
	})

	resp := sendTestMcp(t, model.HttpRequest{
		URL:             server.URL,
		McpMethod:       mcpMethodToolsCall,
		McpName:         "get_weather_data",
		McpOutputSchema: `{"type":"object","properties":{"temperature":{"type":"number"}},"required":["temperature"]}`,
	})
	if len(resp.Warnings) != 0 {
		t.Errorf("warnings = %v, want none", resp.Warnings)
	}
}

func TestMcpSurfacesAToolExecutionError(t *testing.T) {
	server, _ := mcpTestServer(t, func(w http.ResponseWriter, _ mcpCapturedRequest) {
		mcpJSONResult(w, `{"resultType":"complete","isError":true,"content":[{"type":"text","text":"Invalid departure date"}]}`)
	})

	resp := sendTestMcp(t, model.HttpRequest{URL: server.URL, McpMethod: mcpMethodToolsCall, McpName: "book"})
	if !resp.IsError {
		t.Error("isError must be carried through")
	}
	if resp.Error != "" {
		t.Errorf("a tool execution error is a result, not a transport failure: %q", resp.Error)
	}
	if len(resp.Content) != 1 || !strings.Contains(resp.Content[0].Text, "Invalid departure date") {
		t.Errorf("content = %+v", resp.Content)
	}
}

func TestMcpSurfacesAProtocolError(t *testing.T) {
	server, _ := mcpTestServer(t, func(w http.ResponseWriter, _ mcpCapturedRequest) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusNotFound)
		fmt.Fprint(w, `{"jsonrpc":"2.0","id":1,"error":{"code":-32601,"message":"Method not found"}}`)
	})

	resp := sendTestMcp(t, model.HttpRequest{URL: server.URL, McpMethod: mcpMethodPromptsList})
	if resp.RPCErrorCode != -32601 {
		t.Errorf("rpc error code = %d", resp.RPCErrorCode)
	}
	if !strings.Contains(resp.RPCErrorMessage, "Method not found") {
		t.Errorf("rpc error message = %q", resp.RPCErrorMessage)
	}
	if resp.HTTP.StatusCode != http.StatusNotFound {
		t.Errorf("the HTTP status must still be visible, got %d", resp.HTTP.StatusCode)
	}
}

func TestMcpSurfacesAnUnsupportedProtocolVersion(t *testing.T) {
	server, _ := mcpTestServer(t, func(w http.ResponseWriter, _ mcpCapturedRequest) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		fmt.Fprint(w, `{"jsonrpc":"2.0","id":1,"error":{"code":-32021,"message":"Unsupported protocol version","data":{"supported":["2025-06-18"]}}}`)
	})

	resp := sendTestMcp(t, model.HttpRequest{
		URL:                server.URL,
		McpMethod:          mcpMethodToolsList,
		McpProtocolVersion: "2026-07-28",
	})
	if !strings.Contains(resp.RPCErrorData, "2025-06-18") {
		t.Errorf("the versions the server does support must be shown: %q", resp.RPCErrorData)
	}
}

func TestMcpReplacesAHeaderTheProtocolOwns(t *testing.T) {
	server, captured := mcpTestServer(t, func(w http.ResponseWriter, _ mcpCapturedRequest) {
		mcpJSONResult(w, `{"resultType":"complete"}`)
	})

	resp := sendTestMcp(t, model.HttpRequest{
		URL:       server.URL,
		McpMethod: mcpMethodToolsCall,
		McpName:   "real_tool",
		Headers: []model.KeyValue{
			{Key: "Mcp-Name", Value: "spoofed", Enabled: true},
			{Key: "X-Trace", Value: "keep-me", Enabled: true},
		},
	})

	if got := captured.headers.Get("Mcp-Name"); got != "real_tool" {
		t.Errorf("Mcp-Name = %q, the body is the source of truth", got)
	}
	if values := captured.headers.Values("Mcp-Name"); len(values) != 1 {
		t.Errorf("Mcp-Name sent %d times; a duplicate would make the server reject the request", len(values))
	}
	if got := captured.headers.Get("X-Trace"); got != "keep-me" {
		t.Error("an unrelated header must survive")
	}
	if !strings.Contains(strings.Join(resp.Warnings, " "), "Mcp-Name") {
		t.Errorf("the user must be told their header was replaced: %v", resp.Warnings)
	}
}

func TestMcpReadsAResource(t *testing.T) {
	server, captured := mcpTestServer(t, func(w http.ResponseWriter, _ mcpCapturedRequest) {
		mcpJSONResult(w, `{"resultType":"complete","contents":[{"uri":"file:///a.txt","mimeType":"text/plain","text":"hello"}]}`)
	})

	resp := sendTestMcp(t, model.HttpRequest{
		URL:       server.URL,
		McpMethod: mcpMethodResourcesRead,
		McpName:   "file:///a.txt",
	})
	if len(resp.Content) != 1 || resp.Content[0].Text != "hello" {
		t.Fatalf("content = %+v", resp.Content)
	}
	if resp.Content[0].URI != "file:///a.txt" {
		t.Errorf("uri = %q", resp.Content[0].URI)
	}
	if mcpParams(t, *captured)["uri"] != "file:///a.txt" {
		t.Error("resources/read sends the URI as uri, not as name")
	}
	if captured.headers.Get("Mcp-Name") != "file:///a.txt" {
		t.Errorf("Mcp-Name = %q", captured.headers.Get("Mcp-Name"))
	}
}

func TestMcpCarriesAnInputRequiredResultBack(t *testing.T) {
	server, _ := mcpTestServer(t, func(w http.ResponseWriter, _ mcpCapturedRequest) {
		mcpJSONResult(w, `{
			"resultType":"input_required",
			"inputRequests":{"github_login":{"method":"elicitation/create","params":{"mode":"form","message":"Your username"}}},
			"requestState":"opaque-state"
		}`)
	})

	resp := sendTestMcp(t, model.HttpRequest{URL: server.URL, McpMethod: mcpMethodToolsCall, McpName: "login"})
	if resp.ResultType != "input_required" {
		t.Fatalf("resultType = %q", resp.ResultType)
	}
	if !strings.Contains(resp.InputRequests, "github_login") {
		t.Errorf("inputRequests = %q", resp.InputRequests)
	}
	if resp.RequestState != "opaque-state" {
		t.Errorf("requestState = %q", resp.RequestState)
	}
}

func TestMcpRetriesWithTheAnswersToAnInputRequest(t *testing.T) {
	server, captured := mcpTestServer(t, func(w http.ResponseWriter, _ mcpCapturedRequest) {
		mcpJSONResult(w, `{"resultType":"complete","content":[{"type":"text","text":"welcome"}]}`)
	})

	resp := sendTestMcp(t, model.HttpRequest{
		URL:               server.URL,
		McpMethod:         mcpMethodToolsCall,
		McpName:           "login",
		McpArguments:      `{"scope":"repo"}`,
		McpInputResponses: `{"github_login":{"action":"accept","content":{"name":"octocat"}}}`,
		McpRequestState:   "opaque-state",
	})
	if resp.Error != "" {
		t.Fatalf("send: %s", resp.Error)
	}

	params := mcpParams(t, *captured)
	responses, ok := params["inputResponses"].(map[string]any)
	if !ok {
		t.Fatalf("inputResponses were not sent: %+v", params)
	}
	if _, ok := responses["github_login"]; !ok {
		t.Errorf("inputResponses = %+v", responses)
	}
	if params["requestState"] != "opaque-state" {
		t.Errorf("requestState = %v", params["requestState"])
	}
	if arguments, ok := params["arguments"].(map[string]any); !ok || arguments["scope"] != "repo" {
		t.Errorf("the original arguments must be repeated on the retry: %+v", params["arguments"])
	}
}

func TestMcpRefusesAnIncompleteRequest(t *testing.T) {
	cases := []struct {
		name string
		req  model.HttpRequest
		want string
	}{
		{"no endpoint", model.HttpRequest{McpMethod: mcpMethodToolsList}, "no MCP endpoint"},
		{"no method", model.HttpRequest{URL: "https://example.test/mcp"}, "choose a method"},
		{
			"an unknown method",
			model.HttpRequest{URL: "https://example.test/mcp", McpMethod: "sampling/createMessage"},
			"not a method Kurlo knows",
		},
		{
			"a call with no tool name",
			model.HttpRequest{URL: "https://example.test/mcp", McpMethod: mcpMethodToolsCall},
			"needs a name",
		},
		{
			"arguments that are not JSON",
			model.HttpRequest{URL: "https://example.test/mcp", McpMethod: mcpMethodToolsCall, McpName: "x", McpArguments: "{oops"},
			"not a JSON object",
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			resp := sendTestMcp(t, tc.req)
			if !strings.Contains(resp.Error, tc.want) {
				t.Errorf("error = %q, want it to mention %q", resp.Error, tc.want)
			}
		})
	}
}

func TestMcpAnswerAlwaysReachesTheFrontendAsArrays(t *testing.T) {
	resp := model.NormalizeMcpResponse(model.McpResponse{Error: "nothing happened"})
	encoded, err := json.Marshal(resp)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	var decoded map[string]any
	if err := json.Unmarshal(encoded, &decoded); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	for _, field := range []string{"content", "tools", "resources", "prompts", "notifications", "warnings", "supportedVersions", "capabilities"} {
		value, present := decoded[field]
		if !present {
			t.Errorf("%s is missing from the wire", field)
			continue
		}
		if _, ok := value.([]any); !ok {
			t.Errorf("%s serialized as %T, want an array", field, value)
		}
	}
	if headers, ok := decoded["http"].(map[string]any)["headers"].([]any); !ok {
		t.Errorf("http.headers serialized as %T, want an array", headers)
	}
}

func TestMcpParsesEventStreamFraming(t *testing.T) {
	frames := mcpParseEventStream(strings.Join([]string{
		": comment only",
		"",
		"event: message",
		"data: {\"a\":1}",
		"",
		"data: line one",
		"data: line two",
		"",
		"data: {\"b\":2}",
	}, "\n"))

	want := []string{`{"a":1}`, "line one\nline two", `{"b":2}`}
	if len(frames) != len(want) {
		t.Fatalf("frames = %q", frames)
	}
	for i := range want {
		if frames[i] != want[i] {
			t.Errorf("frame %d = %q, want %q", i, frames[i], want[i])
		}
	}
}
