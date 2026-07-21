package api

import (
	"encoding/base64"
	"strings"
	"testing"

	"github.com/relay-client/relay/apps/desktop/internal/model"
	"github.com/relay-client/relay/apps/desktop/internal/script"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/metadata"
)

func TestNormalizeGrpcTarget(t *testing.T) {
	cases := []struct {
		in         string
		defaultTLS bool
		wantTarget string
		wantTLS    bool
		wantErr    bool
	}{
		{"localhost:50051", false, "localhost:50051", false, false},
		{"localhost:50051", true, "localhost:50051", true, false},
		{"grpc://host:1234", false, "host:1234", false, false},
		{"grpcs://host:1234", false, "host:1234", true, false},
		{"https://api.example.com", false, "api.example.com", true, false},
		{"http://host:80", true, "host:80", false, false},
		{"//host:9", false, "host:9", false, false},
		{"host:50051/some/path", false, "host:50051", false, false},
		{"", false, "", false, true},
		{"{{base}}", false, "", false, true},
		{"ftp://x/y", false, "", false, true},
		{"grpc://", false, "", false, true},
	}
	for _, tc := range cases {
		gotTarget, gotTLS, err := normalizeGrpcTarget(tc.in, tc.defaultTLS)
		if tc.wantErr {
			if err == nil {
				t.Errorf("normalizeGrpcTarget(%q) expected error, got %q", tc.in, gotTarget)
			}
			continue
		}
		if err != nil {
			t.Errorf("normalizeGrpcTarget(%q) unexpected error: %v", tc.in, err)
			continue
		}
		if gotTarget != tc.wantTarget || gotTLS != tc.wantTLS {
			t.Errorf("normalizeGrpcTarget(%q) = (%q,%v), want (%q,%v)", tc.in, gotTarget, gotTLS, tc.wantTarget, tc.wantTLS)
		}
	}
}

func TestNormalizeGrpcMethodName(t *testing.T) {
	cases := map[string]string{
		"pkg.Service.Method":  "pkg.Service/Method",
		"/pkg.Service/Method": "pkg.Service/Method",
		"pkg.Service/Method":  "pkg.Service/Method",
		"a.b.c.D":             "a.b.c/D",
		"Method":              "Method",
		"":                    "",
	}
	for in, want := range cases {
		if got := normalizeGrpcMethodName(in); got != want {
			t.Errorf("normalizeGrpcMethodName(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestGrpcMetadataHeaders(t *testing.T) {
	req := model.GrpcRequest{
		Metadata: []model.KeyValue{
			{Key: "x-trace", Value: "abc", Enabled: true},
			{Key: "disabled", Value: "nope", Enabled: false},
			{Key: "", Value: "blank", Enabled: true},
		},
		Auth: model.AuthConfig{Type: "bearer", Token: "tok123"},
	}
	headers := grpcMetadataHeaders(req)
	joined := strings.Join(headers, "\n")
	if !strings.Contains(joined, "x-trace: abc") {
		t.Errorf("expected enabled metadata row, got %v", headers)
	}
	if strings.Contains(joined, "disabled") || strings.Contains(joined, "blank") {
		t.Errorf("disabled/blank rows should be excluded, got %v", headers)
	}
	if !strings.Contains(joined, "authorization: Bearer tok123") {
		t.Errorf("expected bearer auth header, got %v", headers)
	}
}

func TestGrpcMetadataHeadersBasicAndApiKey(t *testing.T) {
	basic := grpcMetadataHeaders(model.GrpcRequest{Auth: model.AuthConfig{Type: "basic", Username: "u", Password: "p"}})
	want := "authorization: Basic " + base64.StdEncoding.EncodeToString([]byte("u:p"))
	if len(basic) != 1 || basic[0] != want {
		t.Errorf("basic auth header = %v, want %q", basic, want)
	}
	apikey := grpcMetadataHeaders(model.GrpcRequest{Auth: model.AuthConfig{Type: "apikey", KeyName: "X-Api-Key", KeyValue: "secret"}})
	if len(apikey) != 1 || apikey[0] != "X-Api-Key: secret" {
		t.Errorf("apikey header = %v", apikey)
	}
}

func TestGrpcMaxReceiveBytes(t *testing.T) {
	const maxInt32 = 1<<31 - 1
	cases := map[int]int{
		-1: 0,
		0:  maxInt32,
		5:  5 * 1024 * 1024,
	}
	for in, want := range cases {
		if got := grpcMaxReceiveBytes(in); got != want {
			t.Errorf("grpcMaxReceiveBytes(%d) = %d, want %d", in, got, want)
		}
	}
	if got := grpcMaxReceiveBytes(1 << 20); got != maxInt32 {
		t.Errorf("grpcMaxReceiveBytes(huge) = %d, want %d", got, maxInt32)
	}
}

func TestGrpcImportPaths(t *testing.T) {
	got := grpcImportPaths("/a/b/x.proto", []string{"/c", "/a/b", "", "/c"})
	want := []string{"/a/b", "/c"}
	if len(got) != len(want) {
		t.Fatalf("grpcImportPaths = %v, want %v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("grpcImportPaths = %v, want %v", got, want)
		}
	}
}

func TestGrpcOutgoingMessageBodies(t *testing.T) {
	if got := grpcOutgoingMessageBodies(""); len(got) != 0 {
		t.Errorf("empty input should yield no bodies, got %v", got)
	}
	single := grpcOutgoingMessageBodies(`{"a":1}`)
	if len(single) != 1 || single[0] != `{"a":1}` {
		t.Errorf("single body = %v", single)
	}
	stream := grpcOutgoingMessageBodies(`{"a":1}{"b":2}`)
	if len(stream) != 2 || stream[0] != `{"a":1}` || stream[1] != `{"b":2}` {
		t.Errorf("streamed bodies = %v", stream)
	}
	nonJSON := grpcOutgoingMessageBodies("hello")
	if len(nonJSON) != 1 || nonJSON[0] != "hello" {
		t.Errorf("non-json fallback = %v", nonJSON)
	}
}

func TestGrpcShouldRecordOutgoingMessage(t *testing.T) {
	cases := map[string]bool{
		"":         false,
		"   ":      false,
		"{}":       false,
		`{"a":1}`:  true,
		"not-json": true,
		`[1,2,3]`:  true,
	}
	for in, want := range cases {
		if got := grpcShouldRecordOutgoingMessage(in); got != want {
			t.Errorf("grpcShouldRecordOutgoingMessage(%q) = %v, want %v", in, got, want)
		}
	}
}

func TestGrpcResponseBody(t *testing.T) {
	if got := grpcResponseBody(nil); got != "" {
		t.Errorf("no messages should yield empty body, got %q", got)
	}
	one := grpcResponseBody([]model.GrpcMessage{
		{Direction: "outgoing", Body: `{"req":1}`},
		{Direction: "incoming", Body: `{"resp":1}`},
	})
	if one != `{"resp":1}` {
		t.Errorf("single incoming body = %q", one)
	}
	many := grpcResponseBody([]model.GrpcMessage{
		{Direction: "incoming", Body: `{"a":1}`},
		{Direction: "incoming", Body: `{"b":2}`},
	})
	if !strings.HasPrefix(strings.TrimSpace(many), "[") || !strings.Contains(many, `"a": 1`) || !strings.Contains(many, `"b": 2`) {
		t.Errorf("multi incoming body = %q", many)
	}
}

func TestGrpcMetadataToKeyValues(t *testing.T) {
	md := metadata.MD{
		"content-type": {"application/grpc"},
		"meta-bin":     {"\x00\x01\x02"},
	}
	rows := grpcMetadataToKeyValues(md)
	if len(rows) != 2 {
		t.Fatalf("expected 2 rows, got %d (%v)", len(rows), rows)
	}
	// sorted: content-type before meta-bin
	if rows[0].Key != "content-type" || rows[0].Value != "application/grpc" {
		t.Errorf("row 0 = %+v", rows[0])
	}
	wantBin := base64.StdEncoding.EncodeToString([]byte("\x00\x01\x02"))
	if rows[1].Key != "meta-bin" || rows[1].Value != wantBin {
		t.Errorf("binary metadata not base64-encoded: %+v", rows[1])
	}
}

func TestGrpcResponseAsHTTP(t *testing.T) {
	ok := grpcResponseAsHTTP(model.GrpcResponse{
		GrpcCode: codes.OK.String(),
		Headers:  []model.KeyValue{{Key: "h", Value: "1", Enabled: true}},
		Trailers: []model.KeyValue{{Key: "t", Value: "2", Enabled: true}},
		Body:     "body",
		Duration: 7,
		Size:     12,
	})
	if ok.StatusCode != 200 || ok.Status != "OK" || ok.Body != "body" {
		t.Errorf("OK mapping wrong: %+v", ok)
	}
	if len(ok.Headers) != 2 {
		t.Errorf("expected headers+trailers merged, got %v", ok.Headers)
	}
	notOK := grpcResponseAsHTTP(model.GrpcResponse{GrpcCode: codes.NotFound.String(), Error: "missing"})
	if notOK.StatusCode != 0 || notOK.Error != "missing" {
		t.Errorf("non-OK mapping wrong: %+v", notOK)
	}
}

func TestScriptGrpcRequestContextRoundTrip(t *testing.T) {
	req := model.GrpcRequest{
		Target:     "host:50051",
		FullMethod: "pkg.Service.Method",
		Metadata: []model.KeyValue{
			{Key: "x-a", Value: "1", Enabled: true},
			{Key: "off", Value: "2", Enabled: false},
		},
	}
	ctx := script.NewContext(nil, nil)
	populateScriptGrpcRequestContext(ctx, req)
	if ctx.RequestURL != "host:50051" || ctx.RequestMethod != "pkg.Service/Method" {
		t.Fatalf("populate wrong: url=%q method=%q", ctx.RequestURL, ctx.RequestMethod)
	}
	if ctx.RequestHeaders["x-a"] != "1" {
		t.Fatalf("enabled metadata not populated: %v", ctx.RequestHeaders)
	}
	if _, ok := ctx.RequestHeaders["off"]; ok {
		t.Fatalf("disabled metadata should not populate: %v", ctx.RequestHeaders)
	}

	ctx.RequestURL = "host:9999"
	ctx.RequestHeaders["x-b"] = "added"
	merged := req
	mergeScriptGrpcRequestContext(ctx, &merged)
	if merged.Target != "host:9999" {
		t.Fatalf("merge did not update target: %q", merged.Target)
	}
	found := map[string]string{}
	for _, row := range merged.Metadata {
		found[row.Key] = row.Value
	}
	if found["x-a"] != "1" || found["x-b"] != "added" {
		t.Fatalf("merged metadata wrong: %v", merged.Metadata)
	}
}
