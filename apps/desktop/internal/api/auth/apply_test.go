package auth

import (
	"net/http"
	"testing"

	"github.com/relay-client/relay/apps/desktop/internal/model"
)

func TestApplyRejectsUnsupportedAuthType(t *testing.T) {
	req, err := http.NewRequest(http.MethodGet, "https://example.test", nil)
	if err != nil {
		t.Fatalf("new request: %v", err)
	}

	if err := Apply(req, model.AuthConfig{Type: "inherit"}); err == nil {
		t.Fatalf("expected unsupported auth type error")
	}
}

func TestApplyAllowsNoAuth(t *testing.T) {
	req, err := http.NewRequest(http.MethodGet, "https://example.test", nil)
	if err != nil {
		t.Fatalf("new request: %v", err)
	}

	if err := Apply(req, model.AuthConfig{}); err != nil {
		t.Fatalf("empty auth should be accepted: %v", err)
	}
	if err := Apply(req, model.AuthConfig{Type: "none"}); err != nil {
		t.Fatalf("none auth should be accepted: %v", err)
	}
}
