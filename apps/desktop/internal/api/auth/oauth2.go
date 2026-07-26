package auth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"crypto/tls"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/relay-client/relay/apps/desktop/internal/model"
)

const (
	oauth2MaxResponseBodySize = 1 * 1024 * 1024
	oauth2AuthorizeTimeout    = 3 * time.Minute
)

// FetchToken runs the OAuth 2.0 client-credentials grant and returns the token
// response. It is kept for backward compatibility — the default grant type.
func FetchToken(cfg model.AuthConfig) model.OAuth2TokenResponse {
	if cfg.OAuth2TokenURL == "" {
		return model.OAuth2TokenResponse{Error: "token URL is required"}
	}
	form := url.Values{}
	form.Set("grant_type", "client_credentials")
	if cfg.OAuth2Scope != "" {
		form.Set("scope", cfg.OAuth2Scope)
	}
	return postTokenRequest(cfg, form)
}

// RefreshToken exchanges a stored refresh token for a fresh access token.
func RefreshToken(cfg model.AuthConfig) model.OAuth2TokenResponse {
	if cfg.OAuth2TokenURL == "" {
		return model.OAuth2TokenResponse{Error: "token URL is required"}
	}
	if cfg.OAuth2RefreshToken == "" {
		return model.OAuth2TokenResponse{Error: "no refresh token available"}
	}
	form := url.Values{}
	form.Set("grant_type", "refresh_token")
	form.Set("refresh_token", cfg.OAuth2RefreshToken)
	if cfg.OAuth2Scope != "" {
		form.Set("scope", cfg.OAuth2Scope)
	}
	resp := postTokenRequest(cfg, form)
	// RFC 6749 §6: the response MAY omit a new refresh token, in which case the
	// caller keeps the existing one. Surface it so the frontend can persist.
	if resp.Error == "" && resp.RefreshToken == "" {
		resp.RefreshToken = cfg.OAuth2RefreshToken
	}
	return resp
}

type authorizeOutcome struct {
	code string
	err  error
}

// AuthorizeCode runs the OAuth 2.0 Authorization Code grant (with PKCE when
// enabled) using a loopback redirect (RFC 8252): it spins up a temporary HTTP
// server on 127.0.0.1, opens the system browser at the authorization endpoint,
// waits for the redirect carrying the code, then exchanges it for tokens.
// openBrowser is injected so the flow can be tested without a real browser.
func AuthorizeCode(ctx context.Context, cfg model.AuthConfig, openBrowser func(string) error) model.OAuth2TokenResponse {
	if cfg.OAuth2AuthURL == "" {
		return model.OAuth2TokenResponse{Error: "authorization URL is required"}
	}
	if cfg.OAuth2TokenURL == "" {
		return model.OAuth2TokenResponse{Error: "token URL is required"}
	}
	if cfg.OAuth2ClientID == "" {
		return model.OAuth2TokenResponse{Error: "client ID is required"}
	}

	authURL, err := url.Parse(cfg.OAuth2AuthURL)
	if err != nil {
		return model.OAuth2TokenResponse{Error: "invalid authorization URL: " + err.Error()}
	}

	state, err := randomURLToken(24)
	if err != nil {
		return model.OAuth2TokenResponse{Error: "failed to generate state: " + err.Error()}
	}

	var verifier, challenge string
	if cfg.OAuth2UsePKCE {
		verifier, err = randomURLToken(48)
		if err != nil {
			return model.OAuth2TokenResponse{Error: "failed to generate PKCE verifier: " + err.Error()}
		}
		challenge = pkceChallengeS256(verifier)
	}

	listener, redirectURL, err := newLoopbackListener(cfg.OAuth2RedirectURL)
	if err != nil {
		return model.OAuth2TokenResponse{Error: err.Error()}
	}
	defer listener.Close()

	q := authURL.Query()
	q.Set("response_type", "code")
	q.Set("client_id", cfg.OAuth2ClientID)
	q.Set("redirect_uri", redirectURL)
	q.Set("state", state)
	if cfg.OAuth2Scope != "" {
		q.Set("scope", cfg.OAuth2Scope)
	}
	if cfg.OAuth2UsePKCE {
		q.Set("code_challenge", challenge)
		q.Set("code_challenge_method", "S256")
	}
	authURL.RawQuery = q.Encode()

	outcome := make(chan authorizeOutcome, 1)
	mux := http.NewServeMux()
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		params := r.URL.Query()
		if errCode := params.Get("error"); errCode != "" {
			msg := errCode
			if desc := params.Get("error_description"); desc != "" {
				msg += ": " + desc
			}
			writeCallbackPage(w, false, msg)
			trySendOutcome(outcome, authorizeOutcome{err: errors.New(msg)})
			return
		}
		if params.Get("state") != state {
			writeCallbackPage(w, false, "State parameter mismatch — the response may have been tampered with.")
			trySendOutcome(outcome, authorizeOutcome{err: errors.New("state parameter mismatch (possible CSRF)")})
			return
		}
		code := params.Get("code")
		if code == "" {
			writeCallbackPage(w, false, "No authorization code was returned.")
			trySendOutcome(outcome, authorizeOutcome{err: errors.New("authorization code missing in redirect")})
			return
		}
		writeCallbackPage(w, true, "")
		trySendOutcome(outcome, authorizeOutcome{code: code})
	})

	server := &http.Server{Handler: mux, ReadHeaderTimeout: 10 * time.Second}
	go func() { _ = server.Serve(listener) }()
	defer func() {
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		_ = server.Shutdown(shutdownCtx)
	}()

	if err := openBrowser(authURL.String()); err != nil {
		return model.OAuth2TokenResponse{Error: "failed to open browser: " + err.Error()}
	}

	timer := time.NewTimer(oauth2AuthorizeTimeout)
	defer timer.Stop()

	var code string
	select {
	case <-ctx.Done():
		return model.OAuth2TokenResponse{Error: "authorization cancelled"}
	case <-timer.C:
		return model.OAuth2TokenResponse{Error: "authorization timed out — no response received from the browser"}
	case res := <-outcome:
		if res.err != nil {
			return model.OAuth2TokenResponse{Error: res.err.Error()}
		}
		code = res.code
	}

	form := url.Values{}
	form.Set("grant_type", "authorization_code")
	form.Set("code", code)
	form.Set("redirect_uri", redirectURL)
	if cfg.OAuth2UsePKCE {
		form.Set("code_verifier", verifier)
	}
	return postTokenRequest(cfg, form)
}

// newLoopbackListener binds a loopback TCP listener and returns the redirect URI
// that points at it. When override is empty a random port on 127.0.0.1 is used;
// otherwise the override host:port is honored (it must still be loopback).
func newLoopbackListener(override string) (net.Listener, string, error) {
	override = strings.TrimSpace(override)
	if override == "" {
		listener, err := net.Listen("tcp", "127.0.0.1:0")
		if err != nil {
			return nil, "", fmt.Errorf("could not start local redirect server: %w", err)
		}
		redirect := fmt.Sprintf("http://127.0.0.1:%d/callback", listener.Addr().(*net.TCPAddr).Port)
		return listener, redirect, nil
	}
	parsed, err := url.Parse(override)
	if err != nil {
		return nil, "", fmt.Errorf("invalid redirect URL: %w", err)
	}
	host := parsed.Hostname()
	if host != "127.0.0.1" && host != "localhost" && host != "::1" {
		return nil, "", fmt.Errorf("redirect URL must be a loopback address (127.0.0.1 or localhost)")
	}
	listener, err := net.Listen("tcp", parsed.Host)
	if err != nil {
		return nil, "", fmt.Errorf("could not bind redirect URL %s: %w", override, err)
	}
	return listener, override, nil
}

func applyClientAuth(form url.Values, cfg model.AuthConfig, audience string) (useBasic bool, err error) {
	method := resolveClientAuth(cfg.OAuth2ClientAuth, cfg.OAuth2Secret)

	switch method {
	case ClientAuthBasic:
		if cfg.OAuth2ClientID == "" {
			return false, fmt.Errorf("oauth2: client ID is required for HTTP Basic client authentication")
		}
		return true, nil

	case ClientAuthClientSecretJWT, ClientAuthPrivateKeyJWT:
		assertionAudience := cfg.OAuth2AssertionAudience
		if assertionAudience == "" {
			assertionAudience = audience
		}
		assertion, err := buildClientAssertion(
			cfg.OAuth2ClientID,
			assertionAudience,
			cfg.OAuth2AssertionAlgorithm,
			cfg.OAuth2AssertionKeyID,
			cfg.OAuth2Secret,
			cfg.OAuth2AssertionPrivateKey,
			method,
		)
		if err != nil {
			return false, err
		}
		form.Set("client_assertion_type", clientAssertionType)
		form.Set("client_assertion", assertion)
		form.Set("client_id", cfg.OAuth2ClientID)
		return false, nil

	default:
		if cfg.OAuth2ClientID != "" {
			form.Set("client_id", cfg.OAuth2ClientID)
		}
		if cfg.OAuth2Secret != "" {
			form.Set("client_secret", cfg.OAuth2Secret)
		}
		return false, nil
	}
}

func oauth2HTTPClient(cfg model.AuthConfig) *http.Client {
	transport := &http.Transport{}
	if cfg.OAuth2InsecureSkipVerify {
		transport.TLSClientConfig = &tls.Config{InsecureSkipVerify: true}
	}
	return &http.Client{Timeout: 15 * time.Second, Transport: transport}
}

func newTokenFormRequest(endpoint string, form url.Values) (*http.Request, error) {
	req, err := http.NewRequest(http.MethodPost, endpoint, strings.NewReader(form.Encode()))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Accept", "application/json")
	return req, nil
}

func postTokenRequest(cfg model.AuthConfig, form url.Values) model.OAuth2TokenResponse {
	if cfg.OAuth2Audience != "" && form.Get("audience") == "" {
		form.Set("audience", cfg.OAuth2Audience)
	}

	useBasicAuth, err := applyClientAuth(form, cfg, cfg.OAuth2TokenURL)
	if err != nil {
		return model.OAuth2TokenResponse{Error: err.Error()}
	}

	req, err := newTokenFormRequest(cfg.OAuth2TokenURL, form)
	if err != nil {
		return model.OAuth2TokenResponse{Error: err.Error()}
	}
	if useBasicAuth {
		req.SetBasicAuth(cfg.OAuth2ClientID, cfg.OAuth2Secret)
	}

	resp, err := oauth2HTTPClient(cfg).Do(req)
	if err != nil {
		return model.OAuth2TokenResponse{Error: err.Error()}
	}
	defer resp.Body.Close()

	var result model.OAuth2TokenResponse
	if err := json.NewDecoder(io.LimitReader(resp.Body, oauth2MaxResponseBodySize)).Decode(&result); err != nil {
		if resp.StatusCode >= 400 {
			return model.OAuth2TokenResponse{Error: fmt.Sprintf("token endpoint returned %s", resp.Status)}
		}
		return model.OAuth2TokenResponse{Error: "failed to decode response: " + err.Error()}
	}
	if result.Error == "" && result.AccessToken == "" && resp.StatusCode >= 400 {
		result.Error = fmt.Sprintf("token endpoint returned %s", resp.Status)
	}
	return result
}

func randomURLToken(nBytes int) (string, error) {
	buf := make([]byte, nBytes)
	if _, err := io.ReadFull(rand.Reader, buf); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(buf), nil
}

func pkceChallengeS256(verifier string) string {
	sum := sha256.Sum256([]byte(verifier))
	return base64.RawURLEncoding.EncodeToString(sum[:])
}

func trySendOutcome(ch chan authorizeOutcome, res authorizeOutcome) {
	select {
	case ch <- res:
	default:
	}
}

func writeCallbackPage(w http.ResponseWriter, ok bool, detail string) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	title := "Authorization complete"
	body := "You can close this window and return to Relay."
	accent := "#5865f2"
	if !ok {
		title = "Authorization failed"
		body = detail
		if body == "" {
			body = "Something went wrong during authorization."
		}
		accent = "#e5484d"
	}
	fmt.Fprintf(w, `<!doctype html><html><head><meta charset="utf-8"><title>%s</title>
<style>
  html,body{height:100%%;margin:0}
  body{display:flex;align-items:center;justify-content:center;background:#0f1014;
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#e6e6ea}
  .card{text-align:center;max-width:380px;padding:40px 32px}
  .dot{width:48px;height:48px;border-radius:50%%;margin:0 auto 20px;background:%s}
  h1{font-size:18px;font-weight:600;margin:0 0 8px}
  p{font-size:14px;line-height:1.5;color:#a0a0ab;margin:0;word-break:break-word}
</style></head>
<body><div class="card"><div class="dot"></div><h1>%s</h1><p>%s</p></div></body></html>`,
		htmlEscape(title), accent, htmlEscape(title), htmlEscape(body))
}

func htmlEscape(s string) string {
	r := strings.NewReplacer("&", "&amp;", "<", "&lt;", ">", "&gt;", `"`, "&quot;", "'", "&#39;")
	return r.Replace(s)
}
