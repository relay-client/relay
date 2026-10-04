package api

import (
	"context"
	"fmt"
	"net/http"
	"net/url"
	"strings"

	"github.com/stormhop/kurlo/apps/desktop/internal/model"
)

type corsRedirectPreflight func(ctx context.Context, next *http.Request) error

func (b *browserSecurityContext) followRedirect(req model.HttpRequest, next *http.Request, via []*http.Request, preflight corsRedirectPreflight) error {
	if b == nil || !b.active {
		return nil
	}
	prev := via[len(via)-1]
	if b.enforceCORS && next.Response != nil {
		if msg := validateCORSOrigin(next.Response.Header, *b); msg != "" {
			return browserBlockedError{label: "CORS", msg: "redirect " + msg}
		}
	}
	if err := restoreBrowserRedirectMethod(next, prev); err != nil {
		return err
	}
	if b.origin != "" {
		if next.URL.User != nil && (b.corsTainted || b.originURL == nil || !sameOrigin(b.originURL, next.URL)) {
			return browserBlockedError{label: "CORS", msg: fmt.Sprintf("redirect to %s carries credentials in the URL; browsers refuse to follow it", redactedURLOrigin(next.URL))}
		}
		crossFromPrev := !sameOrigin(prev.URL, next.URL)
		if b.originURL != nil && crossFromPrev && !sameOrigin(b.originURL, prev.URL) {
			b.origin = "null"
		}
		if crossFromPrev {
			next.Header.Del("Authorization")
		}
		if b.originURL == nil || !browserOriginMatchesTarget(b.originURL, next.URL, b.kind) {
			b.corsTainted = true
			b.crossSiteSeen = true
		}
		b.enforceCORS = b.corsRequested && b.corsTainted
		next.Header.Set("Origin", b.origin)
		if b.kind == browserKindFetch {
			if b.crossSiteSeen {
				next.Header.Set("Sec-Fetch-Site", "cross-site")
			} else {
				next.Header.Set("Sec-Fetch-Site", "same-origin")
			}
		}
		if b.corsTainted && !b.withCredentials {
			next.Header.Del("Cookie")
		}
	}
	if msg := validateBrowserCSP(req, next.URL, *b); msg != "" {
		return browserBlockedError{label: "CSP", msg: msg}
	}
	if msg := blockedBrowserNetworkAccess(next.URL, *b); msg != "" {
		return browserBlockedError{label: "Browser", msg: msg}
	}
	if b.enforceCORS && preflight != nil && corsPreflightRequired(next) {
		return preflight(next.Context(), next)
	}
	return nil
}

func restoreBrowserRedirectMethod(next, prev *http.Request) error {
	if next.Method == prev.Method {
		return nil
	}
	status := 0
	if next.Response != nil {
		status = next.Response.StatusCode
	}
	if (status == http.StatusMovedPermanently || status == http.StatusFound) && prev.Method != http.MethodPost {
		next.Method = prev.Method
		return replayRedirectBody(next, prev)
	}
	for _, name := range []string{"Content-Encoding", "Content-Language", "Content-Location", "Content-Type"} {
		next.Header.Del(name)
	}
	return nil
}

func replayRedirectBody(next, prev *http.Request) error {
	if prev.GetBody != nil {
		bodyCopy, err := prev.GetBody()
		if err != nil {
			return err
		}
		next.Body = bodyCopy
		next.GetBody = prev.GetBody
		next.ContentLength = prev.ContentLength
		return nil
	}
	if prev.Body != nil && prev.Body != http.NoBody {
		return fmt.Errorf("cannot replay request body through redirect: body is not reusable")
	}
	return nil
}

func redactedURLOrigin(u *url.URL) string {
	if u == nil {
		return ""
	}
	return strings.ToLower(u.Scheme) + "://" + strings.ToLower(u.Host)
}

type browserCredentialsJar struct {
	jar   http.CookieJar
	state *browserSecurityContext
}

func (j browserCredentialsJar) omit() bool {
	return j.state != nil && j.state.active && j.state.corsTainted && !j.state.withCredentials
}

func (j browserCredentialsJar) SetCookies(u *url.URL, cookies []*http.Cookie) {
	if j.omit() {
		return
	}
	j.jar.SetCookies(u, cookies)
}

func (j browserCredentialsJar) Cookies(u *url.URL) []*http.Cookie {
	if j.omit() {
		return nil
	}
	return j.jar.Cookies(u)
}
