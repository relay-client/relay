package api

import (
	"testing"
)

// redactSecrets must replace longer secrets first, otherwise a short secret that
// is a substring of a longer one leaves part of the long secret exposed.
func TestRedactSecretsLongestFirst(t *testing.T) {
	got := redactSecrets("authorization: token-12345 (tok)", []string{"tok", "token-12345", ""})
	want := "authorization: [secret] ([secret])"
	if got != want {
		t.Fatalf("redactSecrets = %q, want %q", got, want)
	}
	if got == "authorization: token-12345 (tok)" {
		t.Fatal("secret was not redacted at all")
	}
}

func TestRedactSecretsNoSecrets(t *testing.T) {
	if got := redactSecrets("nothing to hide", nil); got != "nothing to hide" {
		t.Fatalf("expected passthrough, got %q", got)
	}
}
