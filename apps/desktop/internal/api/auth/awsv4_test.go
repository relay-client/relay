package auth

import (
	"encoding/hex"
	"net/http"
	"strings"
	"testing"

	"github.com/relay-client/relay/apps/desktop/internal/model"
)

func TestCanonicalQueryString(t *testing.T) {
	tests := []struct {
		name string
		in   string
		want string
	}{
		{
			name: "empty",
			in:   "",
			want: "",
		},
		{
			name: "single pair already sorted",
			in:   "a=1",
			want: "a=1",
		},
		{
			name: "out of order keys",
			in:   "b=2&a=1",
			want: "a=1&b=2",
		},
		{
			name: "duplicate keys sorted by value",
			in:   "k=2&k=1",
			want: "k=1&k=2",
		},
		{
			name: "space encoded as percent20 not plus",
			in:   "q=hello+world",
			want: "q=hello%20world",
		},
		{
			name: "reserved char encoded",
			in:   "q=a/b",
			want: "q=a%2Fb",
		},
		{
			name: "unreserved chars preserved",
			in:   "q=A-Z_a-z.0-9~",
			want: "q=A-Z_a-z.0-9~",
		},
		{
			name: "empty value preserved",
			in:   "a=&b=1",
			want: "a=&b=1",
		},
		{
			name: "key only (no equals)",
			in:   "flag",
			want: "flag=",
		},
		{
			name: "uppercase hex on re-encoding",
			in:   "q=a%2fb",
			want: "q=a%2Fb",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := canonicalQueryString(tt.in)
			if got != tt.want {
				t.Fatalf("canonicalQueryString(%q):\n  got:  %q\n  want: %q", tt.in, got, tt.want)
			}
		})
	}
}

func TestSignWithoutSessionToken(t *testing.T) {
	req, _ := http.NewRequest(http.MethodGet, "https://example.execute-api.us-east-1.amazonaws.com/prod/items", nil)
	cfg := model.AuthConfig{AWSAccessKey: "AKID", AWSSecretKey: "SECRET", AWSRegion: "us-east-1", AWSService: "execute-api"}
	if err := Sign(req, cfg); err != nil {
		t.Fatalf("Sign: %v", err)
	}
	if got := req.Header.Get("x-amz-security-token"); got != "" {
		t.Errorf("no session token was configured, but one was sent: %q", got)
	}
	if strings.Contains(req.Header.Get("Authorization"), "x-amz-security-token") {
		t.Errorf("SignedHeaders should not list the token: %s", req.Header.Get("Authorization"))
	}
}

func TestSignWithSessionToken(t *testing.T) {
	req, _ := http.NewRequest(http.MethodGet, "https://example.execute-api.us-east-1.amazonaws.com/prod/items", nil)
	cfg := model.AuthConfig{
		AWSAccessKey:    "AKID",
		AWSSecretKey:    "SECRET",
		AWSSessionToken: "FwoGZXIvYXdzEJr//////////wEaDExAMPLETOKEN",
		AWSRegion:       "us-east-1",
		AWSService:      "execute-api",
	}
	if err := Sign(req, cfg); err != nil {
		t.Fatalf("Sign: %v", err)
	}

	if got := req.Header.Get("x-amz-security-token"); got != cfg.AWSSessionToken {
		t.Errorf("x-amz-security-token = %q, want the configured token", got)
	}
	authz := req.Header.Get("Authorization")
	if !strings.Contains(authz, "SignedHeaders=host;x-amz-content-sha256;x-amz-date;x-amz-security-token") {
		t.Errorf("the token must be part of SignedHeaders, got: %s", authz)
	}
}

// TestSignSessionTokenChangesSignature guards the real failure mode: sending the
// token header but leaving it out of the signature. AWS rejects that, and the
// only way to catch it is to check the signature actually differs.
func TestSignSessionTokenChangesSignature(t *testing.T) {
	sigFor := func(cfg model.AuthConfig) string {
		req, _ := http.NewRequest(http.MethodGet, "https://s3.us-east-1.amazonaws.com/bucket/key", nil)
		// Pin the clock-derived headers so only the token differs between runs.
		if err := Sign(req, cfg); err != nil {
			t.Fatalf("Sign: %v", err)
		}
		authz := req.Header.Get("Authorization")
		idx := strings.Index(authz, "Signature=")
		if idx < 0 {
			t.Fatalf("no signature in %q", authz)
		}
		return authz[idx+len("Signature="):]
	}
	base := model.AuthConfig{AWSAccessKey: "AKID", AWSSecretKey: "SECRET", AWSRegion: "us-east-1", AWSService: "s3"}
	withToken := base
	withToken.AWSSessionToken = "SESSIONTOKEN"

	if sigFor(base) == sigFor(withToken) {
		t.Error("adding a session token must change the signature — it is signed, not just sent")
	}
}

// TestSignSessionTokenCanonicalRequest recomputes the signature the way AWS
// would, so the canonical request (not just the header list) is verified.
func TestSignSessionTokenCanonicalRequest(t *testing.T) {
	const token = "SESSIONTOKEN"
	req, _ := http.NewRequest(http.MethodGet, "https://s3.us-east-1.amazonaws.com/bucket/key", nil)
	cfg := model.AuthConfig{
		AWSAccessKey: "AKID", AWSSecretKey: "SECRET", AWSSessionToken: token,
		AWSRegion: "us-east-1", AWSService: "s3",
	}
	if err := Sign(req, cfg); err != nil {
		t.Fatalf("Sign: %v", err)
	}

	dateLong := req.Header.Get("x-amz-date")
	dateShort := dateLong[:8]
	bodyHash := req.Header.Get("x-amz-content-sha256")
	signedHeadersStr := "host;x-amz-content-sha256;x-amz-date;x-amz-security-token"

	canonicalHeaders := "host:" + req.URL.Host + "\n" +
		"x-amz-content-sha256:" + bodyHash + "\n" +
		"x-amz-date:" + dateLong + "\n" +
		"x-amz-security-token:" + token + "\n"
	canonicalRequest := strings.Join([]string{
		"GET", "/bucket/key", "", canonicalHeaders, signedHeadersStr, bodyHash,
	}, "\n")

	credentialScope := dateShort + "/us-east-1/s3/aws4_request"
	stringToSign := strings.Join([]string{
		"AWS4-HMAC-SHA256", dateLong, credentialScope,
		hex.EncodeToString(hashSHA256([]byte(canonicalRequest))),
	}, "\n")
	key := hmacSHA256(hmacSHA256(hmacSHA256(hmacSHA256([]byte("AWS4SECRET"), []byte(dateShort)), []byte("us-east-1")), []byte("s3")), []byte("aws4_request"))
	want := hex.EncodeToString(hmacSHA256(key, []byte(stringToSign)))

	if !strings.HasSuffix(req.Header.Get("Authorization"), "Signature="+want) {
		t.Errorf("signature does not match a recomputed canonical request\n got:  %s\n want signature %s", req.Header.Get("Authorization"), want)
	}
}
