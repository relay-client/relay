package auth

import (
	"fmt"
	"net/http"
	"strings"

	"github.com/relay-client/relay/apps/desktop/internal/model"
)

func Apply(req *http.Request, cfg model.AuthConfig) error {
	switch strings.ToLower(strings.TrimSpace(cfg.Type)) {
	case "", "none":
	case "bearer", "oauth2":
		if cfg.Token != "" {
			req.Header.Set("Authorization", "Bearer "+cfg.Token)
		}
	case "basic":
		req.SetBasicAuth(cfg.Username, cfg.Password)
	case "digest":
	case "apikey":
		if cfg.KeyIn == "header" && cfg.KeyName != "" {
			req.Header.Set(cfg.KeyName, cfg.KeyValue)
		}
	case "aws":
		return Sign(req, cfg)
	default:
		return fmt.Errorf("unsupported auth type %q", cfg.Type)
	}
	return nil
}
