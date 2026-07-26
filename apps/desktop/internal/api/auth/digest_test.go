package auth

import (
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"regexp"
	"strings"
	"testing"
)

// TestParseDigestChallengeMultipleParams guards against a regression where the
// parser dropped every parameter after the first quoted value (the trailing
// ", " separator was not consumed), leaving nonce/qop/opaque empty.
func TestParseDigestChallengeMultipleParams(t *testing.T) {
	challenge := `realm="testrealm@host.com", qop="auth", nonce="dcd98b7102dd2f0e8b11d0f600bfb0c093", opaque="5ccc069c403ebaf9f0171e9517f40e41", algorithm=MD5`
	params := parseDigestChallenge(challenge)

	want := map[string]string{
		"realm":     "testrealm@host.com",
		"qop":       "auth",
		"nonce":     "dcd98b7102dd2f0e8b11d0f600bfb0c093",
		"opaque":    "5ccc069c403ebaf9f0171e9517f40e41",
		"algorithm": "MD5",
	}
	for key, expected := range want {
		if got := params[key]; got != expected {
			t.Errorf("param %q = %q, want %q", key, got, expected)
		}
	}
	// No key should carry a leftover separator prefix.
	for key := range params {
		if strings.ContainsAny(key, ", ") {
			t.Errorf("malformed parsed key %q (contains separator)", key)
		}
	}
}

func TestParseDigestChallengeUnquotedValues(t *testing.T) {
	params := parseDigestChallenge(`realm=relay, nonce=abc123, algorithm=MD5`)
	if params["realm"] != "relay" || params["nonce"] != "abc123" || params["algorithm"] != "MD5" {
		t.Fatalf("unexpected parse of unquoted challenge: %#v", params)
	}
}

// TestComputeDigestAuthQOP verifies that, with a qop="auth" challenge, the
// Authorization header carries a non-empty nonce, the qop/nc/cnonce fields, and
// a response hash consistent with the generated cnonce.
func TestComputeDigestAuthQOP(t *testing.T) {
	params := parseDigestChallenge(`realm="relay", nonce="nonce-1", qop="auth", opaque="op-1"`)
	header, err := computeDigestAuth("user", "pass", "GET", "/protected", params, nil)
	if err != nil {
		t.Fatalf("computeDigestAuth: %v", err)
	}

	for _, needle := range []string{
		`nonce="nonce-1"`,
		`qop=auth`,
		`nc=00000001`,
		`opaque="op-1"`,
		`uri="/protected"`,
	} {
		if !strings.Contains(header, needle) {
			t.Errorf("header missing %q\n  full header: %s", needle, header)
		}
	}

	cnonce := extractDigestField(t, header, "cnonce")
	response := extractDigestField(t, header, "response")
	if cnonce == "" || response == "" {
		t.Fatalf("missing cnonce/response in header: %s", header)
	}

	ha1 := digestMD5("user:relay:pass")
	ha2 := digestMD5("GET:/protected")
	want := digestMD5(ha1 + ":nonce-1:00000001:" + cnonce + ":auth:" + ha2)
	if response != want {
		t.Errorf("response hash = %q, want %q", response, want)
	}
}

func extractDigestField(t *testing.T, header, field string) string {
	t.Helper()
	re := regexp.MustCompile(field + `="?([^",]+)"?`)
	m := re.FindStringSubmatch(header)
	if len(m) < 2 {
		return ""
	}
	return m[1]
}

func TestComputeDigestAuthSHA256(t *testing.T) {
	params := parseDigestChallenge(`realm="relay", nonce="nonce-1", qop="auth", algorithm=SHA-256`)
	header, err := computeDigestAuth("user", "pass", "GET", "/protected", params, nil)
	if err != nil {
		t.Fatalf("computeDigestAuth: %v", err)
	}
	if !strings.Contains(header, "algorithm=SHA-256") {
		t.Errorf("header should echo the server's algorithm token: %s", header)
	}

	cnonce := extractDigestField(t, header, "cnonce")
	response := extractDigestField(t, header, "response")
	ha1 := digestSHA256("user:relay:pass")
	ha2 := digestSHA256("GET:/protected")
	want := digestSHA256(ha1 + ":nonce-1:00000001:" + cnonce + ":auth:" + ha2)
	if response != want {
		t.Errorf("response = %q, want %q", response, want)
	}
	if len(response) != 64 {
		t.Errorf("SHA-256 response should be 64 hex chars, got %d", len(response))
	}
}

func TestComputeDigestAuthRFC7616Vector(t *testing.T) {
	const (
		username = "Mufasa"
		password = "Circle of Life"
		realm    = "http-auth@example.org"
		nonce    = "7ypf/xlj9XXwfDPEoM4URrv/xwf94BcCAzFZH4GiTo0v"
		cnonce   = "f2/wE4q74E6zIJEtWaHKaf5wv/H5QzzpXusqGemxURZJ"
		uri      = "/dir/index.html"
		method   = "GET"
	)
	const wantResponse = "753927fa0e85d155564e2e272a28d1802ca10daf4496794697cf8db5856cb6c1"

	ha1 := digestSHA256(username + ":" + realm + ":" + password)
	ha2 := digestSHA256(method + ":" + uri)
	got := digestSHA256(ha1 + ":" + nonce + ":00000001:" + cnonce + ":auth:" + ha2)
	if got != wantResponse {
		t.Errorf("RFC 7616 SHA-256 vector mismatch:\n got  %s\n want %s", got, wantResponse)
	}
}

func TestComputeDigestAuthSessionVariant(t *testing.T) {
	params := parseDigestChallenge(`realm="relay", nonce="nonce-1", qop="auth", algorithm=SHA-256-sess`)
	header, err := computeDigestAuth("user", "pass", "GET", "/x", params, nil)
	if err != nil {
		t.Fatalf("computeDigestAuth: %v", err)
	}
	cnonce := extractDigestField(t, header, "cnonce")
	response := extractDigestField(t, header, "response")

	base := digestSHA256("user:relay:pass")
	ha1 := digestSHA256(base + ":nonce-1:" + cnonce)
	ha2 := digestSHA256("GET:/x")
	want := digestSHA256(ha1 + ":nonce-1:00000001:" + cnonce + ":auth:" + ha2)
	if response != want {
		t.Errorf("session response = %q, want %q", response, want)
	}
	plain := digestSHA256(base + ":nonce-1:00000001:" + cnonce + ":auth:" + ha2)
	if response == plain {
		t.Error("session variant produced the same response as the plain algorithm")
	}
}

func TestComputeDigestAuthSHA512256(t *testing.T) {
	params := parseDigestChallenge(`realm="relay", nonce="n", qop="auth", algorithm=SHA-512-256`)
	header, err := computeDigestAuth("user", "pass", "POST", "/y", params, nil)
	if err != nil {
		t.Fatalf("computeDigestAuth: %v", err)
	}
	if got := extractDigestField(t, header, "response"); len(got) != 64 {
		t.Errorf("SHA-512-256 response should be 64 hex chars, got %d (%q)", len(got), got)
	}
}

func TestComputeDigestAuthUnsupportedAlgorithm(t *testing.T) {
	params := parseDigestChallenge(`realm="relay", nonce="n", algorithm=SHA-1`)
	if _, err := computeDigestAuth("user", "pass", "GET", "/", params, nil); err == nil {
		t.Fatal("expected an error for an unsupported algorithm")
	}
}

func TestComputeDigestAuthAuthInt(t *testing.T) {
	params := parseDigestChallenge(`realm="relay", nonce="n1", qop="auth-int", algorithm=SHA-256`)
	body := []byte(`{"hello":"world"}`)
	header, err := computeDigestAuth("user", "pass", "POST", "/submit", params, body)
	if err != nil {
		t.Fatalf("computeDigestAuth: %v", err)
	}
	if !strings.Contains(header, "qop=auth-int") {
		t.Errorf("header should use auth-int: %s", header)
	}
	cnonce := extractDigestField(t, header, "cnonce")
	ha1 := digestSHA256("user:relay:pass")
	ha2 := digestSHA256("POST:/submit:" + digestSHA256(string(body)))
	want := digestSHA256(ha1 + ":n1:00000001:" + cnonce + ":auth-int:" + ha2)
	if got := extractDigestField(t, header, "response"); got != want {
		t.Errorf("auth-int response = %q, want %q", got, want)
	}
}

func TestComputeDigestAuthPrefersAuthOverAuthInt(t *testing.T) {
	params := parseDigestChallenge(`realm="relay", nonce="n1", qop="auth,auth-int"`)
	header, err := computeDigestAuth("user", "pass", "GET", "/", params, nil)
	if err != nil {
		t.Fatalf("computeDigestAuth: %v", err)
	}
	if !strings.Contains(header, "qop=auth,") && !strings.HasSuffix(header, "qop=auth") {
		if strings.Contains(header, "auth-int") {
			t.Errorf("should prefer qop=auth when both are offered: %s", header)
		}
	}
	if digestNeedsEntityBody("auth,auth-int") {
		t.Error("digestNeedsEntityBody should be false when plain auth is available")
	}
}

func TestComputeDigestAuthUserhash(t *testing.T) {
	params := parseDigestChallenge(`realm="relay", nonce="n1", qop="auth", algorithm=SHA-256, userhash=true`)
	header, err := computeDigestAuth("user", "pass", "GET", "/", params, nil)
	if err != nil {
		t.Fatalf("computeDigestAuth: %v", err)
	}
	if !strings.Contains(header, "userhash=true") {
		t.Errorf("header must declare userhash=true: %s", header)
	}
	wantUser := digestSHA256("user:relay")
	if !strings.Contains(header, `username="`+wantUser+`"`) {
		t.Errorf("username should be hashed as %s: %s", wantUser, header)
	}
}

func TestComputeDigestAuthNoQOP(t *testing.T) {
	params := parseDigestChallenge(`realm="relay", nonce="n1"`)
	header, err := computeDigestAuth("user", "pass", "GET", "/", params, nil)
	if err != nil {
		t.Fatalf("computeDigestAuth: %v", err)
	}
	if strings.Contains(header, "qop=") || strings.Contains(header, "nc=") {
		t.Errorf("RFC 2069 form must not carry qop/nc: %s", header)
	}
	ha1 := digestMD5("user:relay:pass")
	ha2 := digestMD5("GET:/")
	want := digestMD5(ha1 + ":n1:" + ha2)
	if got := extractDigestField(t, header, "response"); got != want {
		t.Errorf("response = %q, want %q", got, want)
	}
}

func TestResolveDigestAlgorithm(t *testing.T) {
	cases := []struct {
		in      string
		session bool
		ok      bool
	}{
		{"", false, true},
		{"MD5", false, true},
		{"md5", false, true},
		{"MD5-sess", true, true},
		{"SHA-256", false, true},
		{"SHA-256-sess", true, true},
		{"SHA-512-256", false, true},
		{"SHA-512-256-sess", true, true},
		{"SHA-1", false, false},
		{"bogus", false, false},
	}
	for _, tc := range cases {
		got, err := resolveDigestAlgorithm(tc.in)
		if tc.ok != (err == nil) {
			t.Errorf("resolveDigestAlgorithm(%q): err = %v, want ok = %v", tc.in, err, tc.ok)
			continue
		}
		if err == nil && got.session != tc.session {
			t.Errorf("resolveDigestAlgorithm(%q).session = %v, want %v", tc.in, got.session, tc.session)
		}
	}
}

func TestDigestTransportSHA256EndToEnd(t *testing.T) {
	const (
		realm = "relay-test"
		nonce = "server-nonce-42"
		user  = "alice"
		pass  = "s3cret"
	)
	var authorized bool
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		authz := r.Header.Get("Authorization")
		if authz == "" {
			w.Header().Set("WWW-Authenticate", fmt.Sprintf(`Digest realm=%q, qop="auth", nonce=%q, algorithm=SHA-256`, realm, nonce))
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		params := parseDigestChallenge(strings.TrimPrefix(authz, "Digest "))
		ha1 := digestSHA256(user + ":" + realm + ":" + pass)
		ha2 := digestSHA256(r.Method + ":" + r.URL.RequestURI())
		want := digestSHA256(ha1 + ":" + nonce + ":" + params["nc"] + ":" + params["cnonce"] + ":auth:" + ha2)
		if params["response"] != want {
			w.WriteHeader(http.StatusForbidden)
			return
		}
		authorized = true
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	client := &http.Client{Transport: NewDigestTransport(user, pass, http.DefaultTransport)}
	resp, err := client.Get(server.URL + "/dir/index.html?q=1")
	if err != nil {
		t.Fatalf("request: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200 (server rejected the digest response)", resp.StatusCode)
	}
	if !authorized {
		t.Error("server never saw a valid Authorization header")
	}
}

func TestDigestTransportAuthIntEndToEnd(t *testing.T) {
	const (
		realm = "relay-test"
		nonce = "n-auth-int"
		user  = "bob"
		pass  = "pw"
	)
	body := `{"amount":100}`
	var gotBody string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		authz := r.Header.Get("Authorization")
		if authz == "" {
			w.Header().Set("WWW-Authenticate", fmt.Sprintf(`Digest realm=%q, qop="auth-int", nonce=%q, algorithm=SHA-256`, realm, nonce))
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		raw, _ := io.ReadAll(r.Body)
		gotBody = string(raw)
		params := parseDigestChallenge(strings.TrimPrefix(authz, "Digest "))
		if params["qop"] != "auth-int" {
			w.WriteHeader(http.StatusForbidden)
			return
		}
		ha1 := digestSHA256(user + ":" + realm + ":" + pass)
		ha2 := digestSHA256(r.Method + ":" + r.URL.RequestURI() + ":" + digestSHA256(gotBody))
		want := digestSHA256(ha1 + ":" + nonce + ":" + params["nc"] + ":" + params["cnonce"] + ":auth-int:" + ha2)
		if params["response"] != want {
			w.WriteHeader(http.StatusForbidden)
			return
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	client := &http.Client{Transport: NewDigestTransport(user, pass, http.DefaultTransport)}
	resp, err := client.Post(server.URL+"/pay", "application/json", strings.NewReader(body))
	if err != nil {
		t.Fatalf("request: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200 (auth-int response rejected)", resp.StatusCode)
	}
	if gotBody != body {
		t.Errorf("server received body %q, want %q", gotBody, body)
	}
}
