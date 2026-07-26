package api

import (
	"strings"
)

// Collection defaults have to be resolved the same way the app resolves them,
// or a workspace behaves differently in CI than it does on a desktop. This is a
// port of applyCollectionDefaultsToRequest in the frontend; the merge rules are
// deliberately identical, including which side of a joined script wins.

// applyCollectionDefaults folds a collection's defaults into a request.
func applyCollectionDefaults(req cliSavedRequest, collection *cliCollection) cliSavedRequest {
	if collection == nil {
		// A request set to inherit with nowhere to inherit from sends no auth,
		// rather than failing on an "inherit" auth type it cannot apply.
		if strings.EqualFold(req.Auth.Type, "inherit") {
			req.Auth = cliAuth{Type: "none"}
		}
		return req
	}
	defaults := collection.Defaults

	req.Auth = mergeCollectionAuth(defaults.Auth, req.Auth)
	req.Headers = mergeDefaultRows(defaults.Headers, req.Headers)
	// Pre-request scripts run collection-first; test scripts run request-first,
	// so a collection-level assertion sees what the request already checked.
	req.PreRequestScript = joinScripts(defaults.PreRequestScript, req.PreRequestScript)
	req.TestScript = joinScripts(req.TestScript, defaults.TestScript)
	req.PreRequestScriptJs = joinScripts(defaults.PreRequestScriptJs, req.PreRequestScriptJs)
	req.TestScriptJs = joinScripts(req.TestScriptJs, defaults.TestScriptJs)
	req.Settings = mergeCollectionSettings(defaults.Settings, req.Settings)
	return req
}

// mergeCollectionAuth resolves auth: "inherit" against the collection default.
// Anything else on the request wins outright.
func mergeCollectionAuth(defaultAuth, requestAuth cliAuth) cliAuth {
	if !strings.EqualFold(requestAuth.Type, "inherit") {
		return requestAuth
	}
	if defaultAuth.Type != "" && !strings.EqualFold(defaultAuth.Type, "none") && !strings.EqualFold(defaultAuth.Type, "inherit") {
		return defaultAuth
	}
	return cliAuth{Type: "none"}
}

// mergeDefaultRows prepends the collection's rows, skipping any key the request
// already sets. Matching is case-insensitive because these are header names.
func mergeDefaultRows(defaultRows, requestRows []cliKV) []cliKV {
	taken := make(map[string]struct{}, len(requestRows))
	for _, row := range requestRows {
		if key := strings.ToLower(strings.TrimSpace(row.Key)); key != "" {
			taken[key] = struct{}{}
		}
	}
	merged := make([]cliKV, 0, len(defaultRows)+len(requestRows))
	for _, row := range defaultRows {
		key := strings.ToLower(strings.TrimSpace(row.Key))
		if key == "" {
			continue
		}
		if _, exists := taken[key]; exists {
			continue
		}
		merged = append(merged, row)
	}
	return append(merged, requestRows...)
}

// mergeCollectionSettings fills in each setting the request left at its zero
// value. The CLI has no settingsOverrides map, so "unset" is the signal — which
// is why the pointer fields in cliSettings matter.
func mergeCollectionSettings(defaults, req cliSettings) cliSettings {
	if req.HTTPVersion == "" {
		req.HTTPVersion = defaults.HTTPVersion
	}
	if req.EnableSSLVerification == nil {
		req.EnableSSLVerification = defaults.EnableSSLVerification
	}
	if req.FollowRedirects == nil {
		req.FollowRedirects = defaults.FollowRedirects
	}
	if !req.FollowOriginalMethod {
		req.FollowOriginalMethod = defaults.FollowOriginalMethod
	}
	if req.EncodeURLAutomatically == nil {
		req.EncodeURLAutomatically = defaults.EncodeURLAutomatically
	}
	if !req.DisableCookieJar {
		req.DisableCookieJar = defaults.DisableCookieJar
	}
	if req.MaxRedirects == 0 {
		req.MaxRedirects = defaults.MaxRedirects
	}
	if req.TimeoutMs == 0 {
		req.TimeoutMs = defaults.TimeoutMs
	}
	if req.ProxyURL == "" {
		req.ProxyURL = defaults.ProxyURL
	}
	if req.ClientCertPath == "" {
		req.ClientCertPath = defaults.ClientCertPath
	}
	if req.ClientKeyPath == "" {
		req.ClientKeyPath = defaults.ClientKeyPath
	}
	if req.ClientKeyPassword == "" {
		req.ClientKeyPassword = defaults.ClientKeyPassword
	}
	return req
}

func joinScripts(parts ...string) string {
	kept := make([]string, 0, len(parts))
	for _, part := range parts {
		if trimmed := strings.TrimSpace(part); trimmed != "" {
			kept = append(kept, trimmed)
		}
	}
	return strings.Join(kept, "\n\n")
}
