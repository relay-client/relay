package api

import (
	"encoding/json"
	"strings"

	"github.com/relay-client/relay/apps/desktop/internal/model"
)

// The saved request/collection/environment shapes are defined by the frontend
// and serialized to the YAML workspace. The CLI only needs the fields required
// to build and run an HTTP request, so these structs decode a focused subset.

type cliKV struct {
	Key      string `json:"key"`
	Value    string `json:"value"`
	Enabled  bool   `json:"enabled"`
	IsFile   bool   `json:"isFile"`
	FileName string `json:"fileName"`
	Secret   bool   `json:"secret"`
}

type cliAuth struct {
	Type            string `json:"type"`
	BearerToken     string `json:"bearerToken"`
	BasicUser       string `json:"basicUser"`
	BasicPass       string `json:"basicPass"`
	APIKeyName      string `json:"apiKeyName"`
	APIKeyValue     string `json:"apiKeyValue"`
	APIKeyIn        string `json:"apiKeyIn"`
	OAuth2Token     string `json:"oauth2Token"`
	OAuth2TokenURL  string `json:"oauth2TokenURL"`
	OAuth2ClientID  string `json:"oauth2ClientID"`
	OAuth2Secret    string `json:"oauth2Secret"`
	OAuth2Scope     string `json:"oauth2Scope"`
	AWSAccessKey    string `json:"awsAccessKey"`
	AWSSecretKey    string `json:"awsSecretKey"`
	AWSSessionToken string `json:"awsSessionToken"`
	AWSRegion       string `json:"awsRegion"`
	AWSService      string `json:"awsService"`
}

type cliSettings struct {
	HTTPVersion            string `json:"httpVersion"`
	EnableSSLVerification  *bool  `json:"enableSSLVerification"`
	FollowRedirects        *bool  `json:"followRedirects"`
	FollowOriginalMethod   bool   `json:"followOriginalMethod"`
	EncodeURLAutomatically *bool  `json:"encodeUrlAutomatically"`
	DisableCookieJar       bool   `json:"disableCookieJar"`
	MaxRedirects           int    `json:"maxRedirects"`
	TimeoutMs              int    `json:"timeoutMs"`
	ScriptTimeoutMs        int    `json:"scriptTimeoutMs"`
	AllowSendRequest       bool   `json:"allowSendRequest"`
	ProxyURL               string `json:"proxyUrl"`
	ClientCertPath         string `json:"clientCertPath"`
	ClientKeyPath          string `json:"clientKeyPath"`
	ClientKeyPassword      string `json:"clientKeyPassword"`
}

type cliSavedRequest struct {
	ID                 string      `json:"id"`
	Name               string      `json:"name"`
	RequestType        string      `json:"requestType"`
	CollectionID       string      `json:"collectionId"`
	Collection         string      `json:"collection"`
	FolderPath         []string    `json:"folderPath"`
	Method             string      `json:"method"`
	URL                string      `json:"url"`
	IsDraft            bool        `json:"isDraft"`
	Params             []cliKV     `json:"params"`
	Headers            []cliKV     `json:"headers"`
	Auth               cliAuth     `json:"auth"`
	BodyType           string      `json:"bodyType"`
	RawBodyType        string      `json:"rawBodyType"`
	BodyContent        string      `json:"bodyContent"`
	BodyFilePath       string      `json:"bodyFilePath"`
	FormRows           []cliKV     `json:"formRows"`
	PreRequestScript   string      `json:"preRequestScript"`
	TestScript         string      `json:"testScript"`
	PreRequestScriptJs string      `json:"preRequestScriptJs"`
	TestScriptJs       string      `json:"testScriptJs"`
	Settings           cliSettings `json:"settings"`
}

type cliCollectionDefaults struct {
	Variables          []cliKV     `json:"variables"`
	Headers            []cliKV     `json:"headers"`
	Auth               cliAuth     `json:"auth"`
	PreRequestScript   string      `json:"preRequestScript"`
	TestScript         string      `json:"testScript"`
	PreRequestScriptJs string      `json:"preRequestScriptJs"`
	TestScriptJs       string      `json:"testScriptJs"`
	Settings           cliSettings `json:"settings"`
}

type cliCollection struct {
	ID       string                `json:"id"`
	Name     string                `json:"name"`
	Defaults cliCollectionDefaults `json:"defaults"`
}

type cliEnvironment struct {
	ID     string  `json:"id"`
	Name   string  `json:"name"`
	Values []cliKV `json:"values"`
}

func decodeMaps[T any](maps []map[string]any) ([]T, error) {
	out := make([]T, 0, len(maps))
	for _, m := range maps {
		raw, err := json.Marshal(m)
		if err != nil {
			return nil, err
		}
		var value T
		if err := json.Unmarshal(raw, &value); err != nil {
			return nil, err
		}
		out = append(out, value)
	}
	return out, nil
}

func boolOr(ptr *bool, fallback bool) bool {
	if ptr == nil {
		return fallback
	}
	return *ptr
}

func enabledRowValues(rows []cliKV) map[string]string {
	values := make(map[string]string)
	for _, row := range rows {
		if row.Enabled && strings.TrimSpace(row.Key) != "" {
			values[strings.TrimSpace(row.Key)] = row.Value
		}
	}
	return values
}

// cliRunnable reports whether the CLI can execute this request. Realtime
// transports need a live UI session, so they are skipped, matching the desktop
// collection runner.
func cliRunnable(req cliSavedRequest) bool {
	switch strings.ToLower(strings.TrimSpace(req.RequestType)) {
	case "", "http", "graphql":
		return !req.IsDraft
	default:
		return false
	}
}

func isGraphQLRequest(req cliSavedRequest) bool {
	return strings.EqualFold(req.RequestType, "graphql") || req.BodyType == "graphql"
}

// buildHTTPRequest resolves the request's variables and produces the flat
// model.HttpRequest the executor consumes — the Go equivalent of the frontend's
// savedRequestToRunnableHttpRequest.
func buildHTTPRequest(req cliSavedRequest, values map[string]string, secretValues []string, timeoutOverrideMs int) model.HttpRequest {
	resolve := func(v string) string { return resolveTemplateValue(v, values) }
	graphql := isGraphQLRequest(req)

	method := strings.ToUpper(strings.TrimSpace(req.Method))
	if graphql || method == "" {
		if graphql {
			method = "POST"
		} else {
			method = "GET"
		}
	}

	params := make([]model.KeyValue, 0, len(req.Params))
	for _, p := range req.Params {
		if p.Enabled && strings.TrimSpace(p.Key) != "" {
			params = append(params, model.KeyValue{Key: resolve(p.Key), Value: resolve(p.Value), Enabled: true})
		}
	}
	headers := make([]model.KeyValue, 0, len(req.Headers))
	for _, h := range req.Headers {
		if h.Enabled && strings.TrimSpace(h.Key) != "" {
			headers = append(headers, model.KeyValue{Key: resolve(h.Key), Value: resolve(h.Value), Enabled: true})
		}
	}
	formData := make([]model.KeyValue, 0, len(req.FormRows))
	for _, f := range req.FormRows {
		if f.Enabled && strings.TrimSpace(f.Key) != "" {
			formData = append(formData, model.KeyValue{Key: resolve(f.Key), Value: resolve(f.Value), Enabled: true, IsFile: f.IsFile, FileName: f.FileName})
		}
	}

	bodyType := req.BodyType
	body := resolve(req.BodyContent)
	if graphql {
		bodyType = "graphql"
	}

	token := req.Auth.BearerToken
	if req.Auth.Type == "oauth2" {
		token = req.Auth.OAuth2Token
	}

	timeoutMs := req.Settings.TimeoutMs
	if timeoutOverrideMs > 0 {
		timeoutMs = timeoutOverrideMs
	}

	return model.HttpRequest{
		RequestID: req.ID,
		Method:    method,
		URL:       resolve(strings.TrimSpace(req.URL)),
		Params:    params,
		Headers:   headers,
		Auth: model.AuthConfig{
			Type:            req.Auth.Type,
			Token:           resolve(token),
			Username:        resolve(req.Auth.BasicUser),
			Password:        resolve(req.Auth.BasicPass),
			KeyName:         resolve(req.Auth.APIKeyName),
			KeyValue:        resolve(req.Auth.APIKeyValue),
			KeyIn:           req.Auth.APIKeyIn,
			AWSAccessKey:    resolve(req.Auth.AWSAccessKey),
			AWSSecretKey:    resolve(req.Auth.AWSSecretKey),
			AWSSessionToken: resolve(req.Auth.AWSSessionToken),
			AWSRegion:       resolve(req.Auth.AWSRegion),
			AWSService:      resolve(req.Auth.AWSService),
		},
		BodyType:                bodyType,
		Body:                    body,
		BodyFilePath:            resolve(req.BodyFilePath),
		FormData:                formData,
		PreRequestScript:        cliPreScript(req),
		TestScript:              cliTestScript(req),
		ScriptEngine:            cliScriptEngine(req),
		FollowRedirects:         boolOr(req.Settings.FollowRedirects, true),
		TimeoutMs:               timeoutMs,
		HTTPVersion:             defaultString(req.Settings.HTTPVersion, "auto"),
		EnableSSLVerification:   boolOr(req.Settings.EnableSSLVerification, true),
		FollowOriginalMethod:    req.Settings.FollowOriginalMethod,
		EncodeURLAutomatically:  boolOr(req.Settings.EncodeURLAutomatically, true),
		DisableCookieJar:        req.Settings.DisableCookieJar,
		MaxRedirects:            req.Settings.MaxRedirects,
		ProxyURL:                resolve(req.Settings.ProxyURL),
		ClientCertPath:          resolve(req.Settings.ClientCertPath),
		ClientKeyPath:           resolve(req.Settings.ClientKeyPath),
		ClientKeyPassword:       resolve(req.Settings.ClientKeyPassword),
		SecretEnvironmentValues: secretValues,
	}
}

// cliScriptEngine mirrors the app default (JavaScript) while still honouring a
// request that only carries legacy Tengo scripts.
func cliScriptEngine(req cliSavedRequest) string {
	if strings.TrimSpace(req.PreRequestScriptJs) != "" || strings.TrimSpace(req.TestScriptJs) != "" {
		return "js"
	}
	if strings.TrimSpace(req.PreRequestScript) != "" || strings.TrimSpace(req.TestScript) != "" {
		return "tengo"
	}
	return "js"
}

func cliPreScript(req cliSavedRequest) string {
	if cliScriptEngine(req) == "js" {
		return req.PreRequestScriptJs
	}
	return req.PreRequestScript
}

func cliTestScript(req cliSavedRequest) string {
	if cliScriptEngine(req) == "js" {
		return req.TestScriptJs
	}
	return req.TestScript
}

func defaultString(value, fallback string) string {
	if strings.TrimSpace(value) == "" {
		return fallback
	}
	return value
}
