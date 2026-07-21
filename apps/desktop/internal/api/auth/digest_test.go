package auth

import (
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
	header, err := computeDigestAuth("user", "pass", "GET", "/protected", params)
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
