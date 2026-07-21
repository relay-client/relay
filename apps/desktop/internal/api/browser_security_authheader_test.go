package api

import "testing"

// Bug #4 regression: per the Fetch standard, an Access-Control-Allow-Headers
// value of `*` covers any request header EXCEPT `Authorization`, which always
// has to be listed explicitly — even for non-credentialed requests.
func TestCorsHeaderAllowsTokenAuthorizationWildcard(t *testing.T) {
	cases := []struct {
		name     string
		header   string
		token    string
		wildcard bool
		want     bool
	}{
		{"wildcard does not cover authorization", "*", "authorization", true, false},
		{"explicit authorization is allowed", "authorization", "authorization", true, true},
		{"explicit authorization allowed with credentials", "Authorization", "authorization", false, true},
		{"wildcard covers other header without credentials", "*", "x-custom", true, true},
		{"wildcard ignored with credentials", "*", "x-custom", false, false},
		{"explicit custom header allowed", "x-custom, content-type", "x-custom", false, true},
		{"unlisted header rejected", "content-type", "x-custom", false, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := corsHeaderAllowsToken(tc.header, tc.token, tc.wildcard); got != tc.want {
				t.Fatalf("corsHeaderAllowsToken(%q, %q, %v) = %v, want %v", tc.header, tc.token, tc.wildcard, got, tc.want)
			}
		})
	}
}

// Methods continue to honour the wildcard regardless of the Authorization carve-out.
func TestCorsHeaderAllowsTokenMethodWildcard(t *testing.T) {
	if !corsHeaderAllowsToken("*", "PUT", true) {
		t.Fatal("wildcard should allow PUT method without credentials")
	}
	if corsHeaderAllowsToken("*", "PUT", false) {
		t.Fatal("wildcard should not apply to methods with credentials")
	}
}
