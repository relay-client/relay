package auth

import (
	"crypto/md5"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"net/http"
	"strings"
)

type DigestTransport struct {
	username string
	password string
	base     http.RoundTripper
}

func NewDigestTransport(username, password string, base http.RoundTripper) *DigestTransport {
	return &DigestTransport{username: username, password: password, base: base}
}

func (d *DigestTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	first := req.Clone(req.Context())
	if req.GetBody != nil {
		body, err := req.GetBody()
		if err != nil {
			return nil, fmt.Errorf("digest auth: failed to get request body: %w", err)
		}
		first.Body = body
	}

	resp, err := d.base.RoundTrip(first)
	if err != nil || resp.StatusCode != http.StatusUnauthorized {
		return resp, err
	}

	wwwAuth := resp.Header.Get("WWW-Authenticate")
	if !strings.HasPrefix(strings.ToLower(wwwAuth), "digest ") {
		return resp, nil
	}
	_ = resp.Body.Close()

	challenge := parseDigestChallenge(wwwAuth[len("Digest "):])
	uri := req.URL.RequestURI()

	authHeader, err := computeDigestAuth(d.username, d.password, req.Method, uri, challenge)
	if err != nil {
		return nil, err
	}

	retry := req.Clone(req.Context())
	retry.Header.Set("Authorization", authHeader)
	if req.GetBody != nil {
		body, err := req.GetBody()
		if err != nil {
			return nil, fmt.Errorf("digest auth: failed to get request body for retry: %w", err)
		}
		retry.Body = body
	}

	return d.base.RoundTrip(retry)
}

func computeDigestAuth(username, password, method, uri string, params map[string]string) (string, error) {
	realm := params["realm"]
	nonce := params["nonce"]
	qop := params["qop"]
	opaque := params["opaque"]
	algorithm := params["algorithm"]
	if algorithm == "" {
		algorithm = "MD5"
	}
	if !strings.EqualFold(algorithm, "MD5") {
		return "", fmt.Errorf("digest auth: unsupported algorithm %q (only MD5 is supported)", algorithm)
	}

	ha1 := digestMD5(username + ":" + realm + ":" + password)
	ha2 := digestMD5(method + ":" + uri)

	var response, nc, cnonce, usedQop string
	if hasQOPAuth(qop) {
		nc = "00000001"
		var err error
		cnonce, err = digestRandom(8)
		if err != nil {
			return "", fmt.Errorf("digest auth: failed to generate cnonce: %w", err)
		}
		usedQop = "auth"
		response = digestMD5(ha1 + ":" + nonce + ":" + nc + ":" + cnonce + ":" + usedQop + ":" + ha2)
	} else {
		response = digestMD5(ha1 + ":" + nonce + ":" + ha2)
	}

	parts := []string{
		fmt.Sprintf(`Digest username="%s"`, username),
		fmt.Sprintf(`realm="%s"`, realm),
		fmt.Sprintf(`nonce="%s"`, nonce),
		fmt.Sprintf(`uri="%s"`, uri),
		fmt.Sprintf(`algorithm=%s`, algorithm),
		fmt.Sprintf(`response="%s"`, response),
	}
	if usedQop != "" {
		parts = append(parts,
			fmt.Sprintf(`qop=%s`, usedQop),
			fmt.Sprintf(`nc=%s`, nc),
			fmt.Sprintf(`cnonce="%s"`, cnonce),
		)
	}
	if opaque != "" {
		parts = append(parts, fmt.Sprintf(`opaque="%s"`, opaque))
	}
	return strings.Join(parts, ", "), nil
}

func hasQOPAuth(qop string) bool {
	for _, token := range strings.Split(qop, ",") {
		if strings.TrimSpace(token) == "auth" {
			return true
		}
	}
	return false
}

func parseDigestChallenge(challenge string) map[string]string {
	params := make(map[string]string)
	for len(challenge) > 0 {
		// Strip the separator between parameters. The quoted-value branch
		// below consumes only the closing quote, leaving the following ", "
		// in place — without trimming the leading comma here the next key
		// would be parsed as ", nonce" and the real nonce/qop/opaque values
		// would be dropped, producing an invalid (empty-nonce) digest
		// response that every standard server rejects.
		challenge = strings.TrimLeft(challenge, " \t\r\n,")
		if challenge == "" {
			break
		}
		eq := strings.IndexByte(challenge, '=')
		if eq < 0 {
			break
		}
		key := strings.TrimSpace(challenge[:eq])
		challenge = strings.TrimSpace(challenge[eq+1:])

		var val string
		if len(challenge) > 0 && challenge[0] == '"' {
			end := strings.IndexByte(challenge[1:], '"')
			if end < 0 {
				break
			}
			val = challenge[1 : end+1]
			challenge = challenge[end+2:]
		} else {
			end := strings.IndexByte(challenge, ',')
			if end < 0 {
				val = challenge
				challenge = ""
			} else {
				val = strings.TrimSpace(challenge[:end])
				challenge = challenge[end+1:]
			}
		}
		params[key] = val
	}
	return params
}

func digestMD5(s string) string {
	h := md5.Sum([]byte(s))
	return hex.EncodeToString(h[:])
}

func digestRandom(n int) (string, error) {
	b := make([]byte, (n+1)/2)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b)[:n], nil
}
