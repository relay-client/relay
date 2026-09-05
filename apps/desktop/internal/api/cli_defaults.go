package api

import (
	"strings"
)

func applyCollectionDefaults(req cliSavedRequest, collection *cliCollection) cliSavedRequest {
	if collection == nil {
		if strings.EqualFold(req.Auth.Type, "inherit") {
			req.Auth = cliAuth{Type: "none"}
		}
		return req
	}
	defaults := collection.Defaults

	req.Auth = mergeCollectionAuth(defaults.Auth, req.Auth)
	req.Headers = mergeDefaultRows(defaults.Headers, req.Headers)
	req.PreRequestScript = joinScripts(defaults.PreRequestScript, req.PreRequestScript)
	req.TestScript = joinScripts(req.TestScript, defaults.TestScript)
	req.PreRequestScriptJs = joinScripts(defaults.PreRequestScriptJs, req.PreRequestScriptJs)
	req.TestScriptJs = joinScripts(req.TestScriptJs, defaults.TestScriptJs)
	req.Settings = mergeCollectionSettings(defaults.Settings, req.Settings)
	return req
}

func mergeCollectionAuth(defaultAuth, requestAuth cliAuth) cliAuth {
	if !strings.EqualFold(requestAuth.Type, "inherit") {
		return requestAuth
	}
	if defaultAuth.Type != "" && !strings.EqualFold(defaultAuth.Type, "none") && !strings.EqualFold(defaultAuth.Type, "inherit") {
		return defaultAuth
	}
	return cliAuth{Type: "none"}
}

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
	if req.ScriptTimeoutMs == 0 {
		req.ScriptTimeoutMs = defaults.ScriptTimeoutMs
	}
	if !req.AllowSendRequest {
		req.AllowSendRequest = defaults.AllowSendRequest
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
