package api

import (
	"testing"

	"github.com/relay-client/relay/apps/desktop/internal/model"
	"github.com/relay-client/relay/apps/desktop/internal/script"
)

// The script's view of headers and params is a map, so two rows sharing a key
// collapse onto one value. Merging that map back rewrote every row — a request
// with "?id=1&id=2" went out as "?id=2&id=2", and a disabled row came back
// enabled — for any request running any script, including one that only logs.
func TestEmptyScriptLeavesTheRequestUntouched(t *testing.T) {
	req := model.HttpRequest{
		Headers: []model.KeyValue{
			{Key: "X-Multi", Value: "one", Enabled: true},
			{Key: "X-Multi", Value: "two", Enabled: true},
			{Key: "Accept", Value: "stale", Enabled: false},
			{Key: "Accept", Value: "application/json", Enabled: true},
		},
		Params: []model.KeyValue{
			{Key: "id", Value: "1", Enabled: true},
			{Key: "id", Value: "2", Enabled: true},
			{Key: "page", Value: "3", Enabled: true},
		},
	}
	wantHeaders := append([]model.KeyValue(nil), req.Headers...)
	wantParams := append([]model.KeyValue(nil), req.Params...)

	ctx := script.NewContext(nil, nil)
	populateScriptRequestContext(ctx, req)
	if err := script.RunPreRequest("js", `console.log("noop")`, ctx).Error; err != "" {
		t.Fatalf("script error: %s", err)
	}
	mergeScriptHeaders(ctx, &req)
	mergeScriptParams(ctx, &req)

	assertRows(t, "headers", req.Headers, wantHeaders)
	assertRows(t, "params", req.Params, wantParams)
}

func TestScriptWriteUpsertsOnlyTheKeyItNamed(t *testing.T) {
	req := model.HttpRequest{
		Headers: []model.KeyValue{
			{Key: "X-Multi", Value: "one", Enabled: true},
			{Key: "X-Multi", Value: "two", Enabled: true},
			{Key: "Accept", Value: "application/json", Enabled: true},
		},
		Params: []model.KeyValue{
			{Key: "tag", Value: "a", Enabled: true},
			{Key: "tag", Value: "b", Enabled: true},
			{Key: "page", Value: "3", Enabled: true},
		},
	}

	ctx := script.NewContext(nil, nil)
	populateScriptRequestContext(ctx, req)
	src := `pm.request.headers.set("x-multi", "written"); pm.request.params.set("tag", "written")`
	if err := script.RunPreRequest("js", src, ctx).Error; err != "" {
		t.Fatalf("script error: %s", err)
	}
	mergeScriptHeaders(ctx, &req)
	mergeScriptParams(ctx, &req)

	assertRows(t, "headers", req.Headers, []model.KeyValue{
		{Key: "X-Multi", Value: "written", Enabled: true},
		{Key: "Accept", Value: "application/json", Enabled: true},
	})
	assertRows(t, "params", req.Params, []model.KeyValue{
		{Key: "tag", Value: "written", Enabled: true},
		{Key: "page", Value: "3", Enabled: true},
	})
}

// A script that writes a header the request does not have appends it, and a
// disabled row for that header is the one it revives.
func TestScriptWriteRevivesADisabledRowAndAppendsNewOnes(t *testing.T) {
	req := model.HttpRequest{
		Headers: []model.KeyValue{{Key: "X-Trace", Value: "old", Enabled: false}},
	}
	ctx := script.NewContext(nil, nil)
	populateScriptRequestContext(ctx, req)
	src := `pm.request.headers.set("X-Trace", "new"); pm.request.headers.set("X-Fresh", "1")`
	if err := script.RunPreRequest("js", src, ctx).Error; err != "" {
		t.Fatalf("script error: %s", err)
	}
	mergeScriptHeaders(ctx, &req)

	assertRows(t, "headers", req.Headers, []model.KeyValue{
		{Key: "X-Trace", Value: "new", Enabled: true},
		{Key: "X-Fresh", Value: "1", Enabled: true},
	})
}

// Filtering the row slices in place aliased the caller's backing array, so a
// removal overwrote rows the caller still held.
func TestScriptRemovalDoesNotOverwriteTheCallersRows(t *testing.T) {
	original := []model.KeyValue{
		{Key: "X-Drop", Value: "gone", Enabled: true},
		{Key: "X-Keep", Value: "kept", Enabled: true},
	}
	req := model.HttpRequest{Headers: original}

	ctx := script.NewContext(nil, nil)
	populateScriptRequestContext(ctx, req)
	if err := script.RunPreRequest("js", `pm.request.headers.unset("X-Drop")`, ctx).Error; err != "" {
		t.Fatalf("script error: %s", err)
	}
	mergeScriptHeaders(ctx, &req)

	assertRows(t, "headers", req.Headers, []model.KeyValue{{Key: "X-Keep", Value: "kept", Enabled: true}})
	if original[0].Key != "X-Drop" || original[1].Key != "X-Keep" {
		t.Fatalf("caller's slice was overwritten: %+v", original)
	}
}

func assertRows(t *testing.T, label string, got, want []model.KeyValue) {
	t.Helper()
	if len(got) != len(want) {
		t.Fatalf("%s: got %d rows %+v, want %d rows %+v", label, len(got), got, len(want), want)
	}
	for i := range want {
		if got[i].Key != want[i].Key || got[i].Value != want[i].Value || got[i].Enabled != want[i].Enabled {
			t.Errorf("%s[%d] = {%s %s enabled=%v}, want {%s %s enabled=%v}",
				label, i, got[i].Key, got[i].Value, got[i].Enabled,
				want[i].Key, want[i].Value, want[i].Enabled)
		}
	}
}
