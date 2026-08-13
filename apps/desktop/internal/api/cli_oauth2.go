package api

import (
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/relay-client/relay/apps/desktop/internal/api/auth"
	"github.com/relay-client/relay/apps/desktop/internal/model"
)

// A run gets its own OAuth 2.0 access tokens instead of relying on one saved by
// the desktop app. The saved token lives in the machine-local secret store and
// never reaches a checkout, so a collection using OAuth 2.0 could not be run in
// CI at all — and even locally it expired without anything renewing it, because
// the app's pre-send refresh only ever ran for the request open in the editor.
//
// Only the grants that can complete without a person are attempted here:
// client credentials, resource-owner password, and swapping a refresh token.
// Authorization Code and Device Code need a browser, so a run uses whatever
// token the workspace already carries and says plainly when there isn't one.

// oauth2TokenCache hands the same access token to every request in a run that
// shares a configuration, rather than re-authenticating per request.
type oauth2TokenCache struct {
	mu     sync.Mutex
	tokens map[string]cachedOAuth2Token
}

type cachedOAuth2Token struct {
	accessToken string
	expiresAt   time.Time
}

func newOAuth2TokenCache() *oauth2TokenCache {
	return &oauth2TokenCache{tokens: make(map[string]cachedOAuth2Token)}
}

// resolveOAuth2Token fills in cfg.Token for an oauth2 request. It returns an
// error only when no usable token can be produced at all; a request that
// already carries a valid token is left alone.
func (c *oauth2TokenCache) resolveOAuth2Token(cfg *model.AuthConfig) error {
	if c == nil || cfg == nil || !strings.EqualFold(cfg.Type, "oauth2") {
		return nil
	}

	key := oauth2CacheKey(*cfg)
	c.mu.Lock()
	if cached, ok := c.tokens[key]; ok && cached.accessToken != "" && !oauth2TokenExpired(cached.expiresAt) {
		cfg.Token = cached.accessToken
		c.mu.Unlock()
		return nil
	}
	c.mu.Unlock()

	response, attempted := fetchCLIOAuth2Token(*cfg)
	if !attempted {
		if cfg.Token != "" {
			return nil
		}
		return fmt.Errorf(
			"auth error: the %s grant needs a browser sign-in, and this workspace carries no access token. "+
				"Sign in once in the app, or use a grant a run can complete on its own "+
				"(client credentials, password, or a stored refresh token)",
			oauth2GrantLabel(cfg.OAuth2GrantType))
	}
	if response.Error != "" {
		if cfg.Token != "" {
			// A token is already there; a failed renewal should not stop a run
			// that the server may still accept.
			return nil
		}
		message := response.Error
		if response.ErrorDesc != "" {
			message += " — " + response.ErrorDesc
		}
		return fmt.Errorf("auth error: could not obtain an OAuth 2.0 access token: %s", message)
	}
	if response.AccessToken == "" {
		if cfg.Token != "" {
			return nil
		}
		return fmt.Errorf("auth error: the token endpoint returned no access token")
	}

	expiresAt := time.Time{}
	if response.ExpiresIn > 0 {
		expiresAt = time.Now().Add(time.Duration(response.ExpiresIn) * time.Second)
	}
	c.mu.Lock()
	c.tokens[key] = cachedOAuth2Token{accessToken: response.AccessToken, expiresAt: expiresAt}
	c.mu.Unlock()

	cfg.Token = response.AccessToken
	return nil
}

// fetchCLIOAuth2Token runs the grant when it can run unattended. The second
// return value reports whether an attempt was made at all, so the caller can
// tell "the server said no" apart from "this grant needs a person".
func fetchCLIOAuth2Token(cfg model.AuthConfig) (model.OAuth2TokenResponse, bool) {
	switch strings.ToLower(strings.TrimSpace(cfg.OAuth2GrantType)) {
	case "password":
		if cfg.OAuth2TokenURL != "" && cfg.OAuth2Username != "" {
			return auth.FetchTokenPassword(cfg), true
		}
	case "authorization_code", "device_code":
		// Interactive by definition. Fall back to a stored refresh token, which
		// is exactly how these grants are meant to be renewed.
		if cfg.OAuth2RefreshToken != "" && cfg.OAuth2TokenURL != "" {
			return auth.RefreshToken(cfg), true
		}
	default: // client_credentials, and anything unset
		if cfg.OAuth2TokenURL != "" && cfg.OAuth2ClientID != "" {
			return auth.FetchToken(cfg), true
		}
		if cfg.OAuth2RefreshToken != "" && cfg.OAuth2TokenURL != "" {
			return auth.RefreshToken(cfg), true
		}
	}
	return model.OAuth2TokenResponse{}, false
}

// oauth2CacheKey identifies a token by everything that changes which token the
// server hands back. Credentials are part of that, so this value is only ever
// held in memory for the duration of the run.
func oauth2CacheKey(cfg model.AuthConfig) string {
	return strings.Join([]string{
		cfg.OAuth2GrantType, cfg.OAuth2TokenURL, cfg.OAuth2ClientID, cfg.OAuth2Secret,
		cfg.OAuth2Scope, cfg.OAuth2Audience, cfg.OAuth2Username, cfg.OAuth2Password,
		cfg.OAuth2RefreshToken, cfg.OAuth2ClientAuth, cfg.OAuth2AssertionKeyID,
	}, "\x00")
}

// oauth2TokenExpired keeps the same 30-second margin the app uses, so a token
// is never handed to a request that will outlive it.
func oauth2TokenExpired(expiresAt time.Time) bool {
	if expiresAt.IsZero() {
		return false
	}
	return time.Now().After(expiresAt.Add(-30 * time.Second))
}

func oauth2GrantLabel(grant string) string {
	switch strings.ToLower(strings.TrimSpace(grant)) {
	case "device_code":
		return "Device Code"
	case "authorization_code":
		return "Authorization Code"
	default:
		return grant
	}
}
