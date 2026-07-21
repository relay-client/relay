package auth

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/relay-client/relay/apps/desktop/internal/model"
)

func TestPKCEChallengeS256_RFC7636Vector(t *testing.T) {
	// Test vector from RFC 7636 Appendix B.
	verifier := "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"
	want := "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
	if got := pkceChallengeS256(verifier); got != want {
		t.Fatalf("pkceChallengeS256 = %q, want %q", got, want)
	}
}

func TestFetchToken_ClientCredentials(t *testing.T) {
	var gotGrant, gotScope, gotAuth string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = r.ParseForm()
		gotGrant = r.Form.Get("grant_type")
		gotScope = r.Form.Get("scope")
		gotAuth = r.Header.Get("Authorization")
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"access_token": "at-cc", "token_type": "Bearer", "expires_in": 1200})
	}))
	defer srv.Close()

	resp := FetchToken(model.AuthConfig{OAuth2TokenURL: srv.URL, OAuth2ClientID: "id", OAuth2Secret: "secret", OAuth2Scope: "read write"})
	if resp.Error != "" {
		t.Fatalf("unexpected error: %s", resp.Error)
	}
	if resp.AccessToken != "at-cc" {
		t.Errorf("access token = %q, want at-cc", resp.AccessToken)
	}
	if gotGrant != "client_credentials" {
		t.Errorf("grant_type = %q, want client_credentials", gotGrant)
	}
	if gotScope != "read write" {
		t.Errorf("scope = %q, want 'read write'", gotScope)
	}
	if !strings.HasPrefix(gotAuth, "Basic ") {
		t.Errorf("expected HTTP Basic auth for confidential client, got %q", gotAuth)
	}
}

func TestRefreshToken(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = r.ParseForm()
		if r.Form.Get("grant_type") != "refresh_token" {
			t.Errorf("grant_type = %q, want refresh_token", r.Form.Get("grant_type"))
		}
		if r.Form.Get("refresh_token") != "rt-old" {
			t.Errorf("refresh_token = %q, want rt-old", r.Form.Get("refresh_token"))
		}
		w.Header().Set("Content-Type", "application/json")
		// Omit a new refresh token to verify the old one is carried over.
		_ = json.NewEncoder(w).Encode(map[string]any{"access_token": "at-new", "token_type": "Bearer", "expires_in": 600})
	}))
	defer srv.Close()

	resp := RefreshToken(model.AuthConfig{OAuth2TokenURL: srv.URL, OAuth2ClientID: "id", OAuth2Secret: "secret", OAuth2RefreshToken: "rt-old"})
	if resp.Error != "" {
		t.Fatalf("unexpected error: %s", resp.Error)
	}
	if resp.AccessToken != "at-new" {
		t.Errorf("access token = %q, want at-new", resp.AccessToken)
	}
	if resp.RefreshToken != "rt-old" {
		t.Errorf("refresh token = %q, want carried-over rt-old", resp.RefreshToken)
	}
}

func TestRefreshToken_RequiresRefreshToken(t *testing.T) {
	resp := RefreshToken(model.AuthConfig{OAuth2TokenURL: "https://example.com/token"})
	if resp.Error == "" {
		t.Fatal("expected error when no refresh token is set")
	}
}

func TestAuthorizeCode_PKCEFlow(t *testing.T) {
	var gotChallenge, gotChallengeMethod, gotVerifier, gotCode, gotGrant, gotRedirect string
	var gotClientIDInBody string

	mux := http.NewServeMux()
	mux.HandleFunc("/authorize", func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query()
		gotChallenge = q.Get("code_challenge")
		gotChallengeMethod = q.Get("code_challenge_method")
		// Simulate the user approving: redirect back to the loopback redirect_uri.
		http.Redirect(w, r, q.Get("redirect_uri")+"?code=auth-code-1&state="+q.Get("state"), http.StatusFound)
	})
	mux.HandleFunc("/token", func(w http.ResponseWriter, r *http.Request) {
		_ = r.ParseForm()
		gotGrant = r.Form.Get("grant_type")
		gotCode = r.Form.Get("code")
		gotVerifier = r.Form.Get("code_verifier")
		gotRedirect = r.Form.Get("redirect_uri")
		gotClientIDInBody = r.Form.Get("client_id")
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"access_token": "at-code", "token_type": "Bearer", "expires_in": 3600, "refresh_token": "rt-code",
		})
	})
	srv := httptest.NewServer(mux)
	defer srv.Close()

	cfg := model.AuthConfig{
		OAuth2AuthURL:  srv.URL + "/authorize",
		OAuth2TokenURL: srv.URL + "/token",
		OAuth2ClientID: "public-client",
		OAuth2UsePKCE:  true,
		// no secret => public client => client_id goes in the body
	}

	openBrowser := func(target string) error {
		// Stand in for the system browser: hit the authorize URL and follow the
		// redirect to the loopback callback (http.Get follows redirects).
		resp, err := http.Get(target)
		if err == nil {
			_ = resp.Body.Close()
		}
		return err
	}

	resp := AuthorizeCode(context.Background(), cfg, openBrowser)
	if resp.Error != "" {
		t.Fatalf("unexpected error: %s", resp.Error)
	}
	if resp.AccessToken != "at-code" {
		t.Errorf("access token = %q, want at-code", resp.AccessToken)
	}
	if resp.RefreshToken != "rt-code" {
		t.Errorf("refresh token = %q, want rt-code", resp.RefreshToken)
	}
	if gotChallengeMethod != "S256" {
		t.Errorf("code_challenge_method = %q, want S256", gotChallengeMethod)
	}
	if gotChallenge == "" {
		t.Error("expected a code_challenge on the authorize request")
	}
	if gotVerifier == "" {
		t.Error("expected a code_verifier on the token request")
	}
	// The verifier must hash to the challenge that was presented.
	if pkceChallengeS256(gotVerifier) != gotChallenge {
		t.Error("code_verifier does not match the presented code_challenge")
	}
	if gotGrant != "authorization_code" {
		t.Errorf("grant_type = %q, want authorization_code", gotGrant)
	}
	if gotCode != "auth-code-1" {
		t.Errorf("code = %q, want auth-code-1", gotCode)
	}
	if !strings.HasPrefix(gotRedirect, "http://127.0.0.1:") {
		t.Errorf("redirect_uri = %q, want loopback", gotRedirect)
	}
	if gotClientIDInBody != "public-client" {
		t.Errorf("client_id in body = %q, want public-client (public client)", gotClientIDInBody)
	}
}

func TestAuthorizeCode_StateMismatchRejected(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/authorize", func(w http.ResponseWriter, r *http.Request) {
		// Return a tampered state.
		http.Redirect(w, r, r.URL.Query().Get("redirect_uri")+"?code=x&state=wrong-state", http.StatusFound)
	})
	mux.HandleFunc("/token", func(w http.ResponseWriter, r *http.Request) {
		t.Error("token endpoint must not be called on state mismatch")
	})
	srv := httptest.NewServer(mux)
	defer srv.Close()

	cfg := model.AuthConfig{OAuth2AuthURL: srv.URL + "/authorize", OAuth2TokenURL: srv.URL + "/token", OAuth2ClientID: "id"}
	openBrowser := func(target string) error {
		resp, err := http.Get(target)
		if err == nil {
			_ = resp.Body.Close()
		}
		return err
	}
	resp := AuthorizeCode(context.Background(), cfg, openBrowser)
	if resp.Error == "" {
		t.Fatal("expected error on state mismatch")
	}
	if !strings.Contains(strings.ToLower(resp.Error), "state") {
		t.Errorf("expected a state-related error, got %q", resp.Error)
	}
}

func TestAuthorizeCode_MissingConfig(t *testing.T) {
	resp := AuthorizeCode(context.Background(), model.AuthConfig{OAuth2TokenURL: "x", OAuth2ClientID: "y"}, func(string) error { return nil })
	if resp.Error == "" {
		t.Fatal("expected error when authorization URL is missing")
	}
}
