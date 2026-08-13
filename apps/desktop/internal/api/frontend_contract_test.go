package api

import (
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"regexp"
	"sort"
	"strings"
	"testing"

	"github.com/relay-client/relay/apps/desktop/internal/model"
)

// The frontend derives its wire types from the generated Wails bindings, so
// anything reachable from a bound method signature cannot drift. Three seams are
// not reachable that way and are checked here instead:
//
//   - the request-setting name lists this package keeps for the workspace files,
//   - the CLI's own decode structs, which read the same workspace,
//   - the event payloads, which travel over the runtime event bus rather than
//     as the return value of a bound method.
//
// Each of these has already produced a bug: a setting implemented in Go and
// unreachable from the app, an OAuth grant the CLI could not run, and a whole
// class of fields dropped on save.

func frontendSource(t *testing.T, name string) string {
	t.Helper()
	path := filepath.Join("..", "..", "frontend", "src", "lib", name)
	data, err := os.ReadFile(path)
	if err != nil {
		t.Skipf("frontend sources unavailable: %v", err)
	}
	return string(data)
}

// objectKeys pulls the property names out of a `const X = { ... }` or
// `function x() { return { ... } }` block in a TypeScript source.
func objectKeys(t *testing.T, source, declaration string) []string {
	t.Helper()
	start := strings.Index(source, declaration)
	if start < 0 {
		t.Fatalf("could not find %q in the frontend source", declaration)
	}
	depth, end := 0, -1
	for i := start; i < len(source); i++ {
		switch source[i] {
		case '{':
			depth++
		case '}':
			depth--
			if depth == 0 {
				end = i
			}
		}
		if end >= 0 {
			break
		}
	}
	if end < 0 {
		t.Fatalf("unbalanced braces after %q", declaration)
	}
	var keys []string
	for _, m := range regexp.MustCompile(`(?m)^\s{2,4}([A-Za-z][A-Za-z0-9]*)\??\s*:`).FindAllStringSubmatch(source[start:end], -1) {
		keys = append(keys, m[1])
	}
	if len(keys) == 0 {
		t.Fatalf("found no properties in %q", declaration)
	}
	return keys
}

// jsonFieldNames reads the json tag of every exported field on a struct.
func jsonFieldNames(value any) []string {
	typ := reflect.TypeOf(value)
	names := make([]string, 0, typ.NumField())
	for i := 0; i < typ.NumField(); i++ {
		tag := typ.Field(i).Tag.Get("json")
		if tag == "" || tag == "-" {
			continue
		}
		names = append(names, strings.Split(tag, ",")[0])
	}
	return names
}

func missingFrom(want, have []string) []string {
	present := make(map[string]bool, len(have))
	for _, name := range have {
		present[name] = true
	}
	var missing []string
	for _, name := range want {
		if !present[name] {
			missing = append(missing, name)
		}
	}
	sort.Strings(missing)
	return missing
}

// A request setting the app can set has to be a setting the workspace writer
// knows about, or it is silently dropped from the file on the next save. The
// three realtime tuning settings were the other way round — implemented in Go,
// with no field in the frontend model — and sat unreachable for two releases.
func TestRequestSettingListsCoverTheFrontendModel(t *testing.T) {
	settings := objectKeys(t, frontendSource(t, "constants.ts"), "export const DEFAULT_REQUEST_SETTINGS")

	// Settings the workspace writer deliberately never filters by request type.
	// They are written for every request, so they are absent from the per-type
	// lists on purpose rather than by omission.
	alwaysWritten := map[string]bool{
		"scriptTimeoutMs":   true,
		"allowSendRequest":  true,
		"clientCertPath":    true,
		"clientKeyPath":     true,
		"clientKeyPassword": true,
	}

	var unknown []string
	for _, name := range settings {
		if alwaysWritten[name] {
			continue
		}
		if _, ok := savedRequestSettingDefaults[name]; !ok {
			unknown = append(unknown, name)
		}
	}
	if len(unknown) > 0 {
		t.Errorf("settings with no entry in savedRequestSettingDefaults, so a non-default value is written to the workspace on every save: %s",
			strings.Join(unknown, ", "))
	}

	known := make(map[string]bool, len(settings))
	for _, name := range settings {
		known[name] = true
	}
	var stale []string
	for name := range savedRequestSettingDefaults {
		if !known[name] {
			stale = append(stale, name)
		}
	}
	sort.Strings(stale)
	if len(stale) > 0 {
		t.Errorf("savedRequestSettingDefaults names settings the frontend no longer has: %s", strings.Join(stale, ", "))
	}
}

// `relay run` decodes the workspace with its own structs. A field it does not
// declare is a field the run behaves without — which is how an OAuth-protected
// collection became unrunnable in CI while working in the app.
func TestCLIStructsCoverTheAuthModel(t *testing.T) {
	authState := objectKeys(t, frontendSource(t, "utils.ts"), "export function emptyAuthState()")
	declared := jsonFieldNames(cliAuth{})

	// Deliberate omissions, each with a reason. Anything else missing is drift.
	skip := map[string]string{
		"oauth2TokenExpiry":        "a run fetches its own token, so the app's expiry stamp is irrelevant",
		"oauth2RedirectURL":        "the loopback redirect is built by the Go side at authorize time",
		"oauth2InsecureSkipVerify": "covered by the run's --insecure flag",
	}
	var want []string
	for _, name := range authState {
		if _, skipped := skip[name]; !skipped {
			want = append(want, name)
		}
	}

	if missing := missingFrom(want, declared); len(missing) > 0 {
		t.Errorf("cliAuth cannot decode these auth fields, so `relay run` ignores them: %s\n"+
			"add them to cliAuth and map them in buildHTTPRequest, or add them to the skip list with a reason",
			strings.Join(missing, ", "))
	}
}

func TestCLIStructsCoverTheSettingsModel(t *testing.T) {
	settings := objectKeys(t, frontendSource(t, "constants.ts"), "export const DEFAULT_REQUEST_SETTINGS")
	declared := jsonFieldNames(cliSettings{})

	// A run sends HTTP and GraphQL only; realtime requests are skipped, so their
	// tuning settings have nothing to act on.
	skip := regexp.MustCompile(`^(ws|sio|sse|grpc)`)
	// Browser emulation and redirect-header policy are not wired into the runner
	// yet. Listing them here keeps the omission a decision rather than an oversight.
	notWiredYet := map[string]bool{
		"browserEmulation":          true,
		"browserOrigin":             true,
		"browserWithCredentials":    true,
		"browserEnforceCORS":        true,
		"browserEnforceCSP":         true,
		"browserCSP":                true,
		"followAuthorizationHeader": true,
		"removeRefererHeader":       true,
	}

	var want []string
	for _, name := range settings {
		if skip.MatchString(name) || notWiredYet[name] {
			continue
		}
		want = append(want, name)
	}

	if missing := missingFrom(want, declared); len(missing) > 0 {
		t.Errorf("cliSettings cannot decode these settings, so `relay run` behaves differently from the app: %s",
			strings.Join(missing, ", "))
	}
}

// These payloads reach the frontend over the event bus, so Wails never generates
// a type for them and the frontend restates them by hand in wire.ts. This is the
// only place left where a Go struct has a hand-written twin.
func TestEventPayloadsMatchTheirHandWrittenTypes(t *testing.T) {
	wire := frontendSource(t, "wire.ts")

	cases := []struct {
		tsType string
		goType any
	}{
		{"GrpcHeadersEvent", model.GrpcHeadersEvent{}},
		{"GrpcMessageEvent", model.GrpcMessageEvent{}},
		{"GrpcTrailersEvent", model.GrpcTrailersEvent{}},
		{"GrpcDoneEvent", model.GrpcDoneEvent{}},
		{"OAuth2DevicePrompt", model.OAuth2DevicePrompt{}},
	}

	for _, testCase := range cases {
		t.Run(testCase.tsType, func(t *testing.T) {
			declared := objectKeys(t, wire, fmt.Sprintf("export type %s = {", testCase.tsType))
			goFields := jsonFieldNames(testCase.goType)

			if missing := missingFrom(goFields, declared); len(missing) > 0 {
				t.Errorf("%s in wire.ts is missing fields the Go struct emits: %s", testCase.tsType, strings.Join(missing, ", "))
			}
			if extra := missingFrom(declared, goFields); len(extra) > 0 {
				t.Errorf("%s in wire.ts declares fields the Go struct does not emit: %s", testCase.tsType, strings.Join(extra, ", "))
			}
		})
	}
}
