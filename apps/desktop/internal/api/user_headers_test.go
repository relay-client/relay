package api

import (
	"net/http"
	"strings"
	"testing"

	"github.com/relay-client/relay/apps/desktop/internal/model"
)

// Host was lumped in with the framing headers and dropped, so a request built
// to reach a virtual host went out with the URL's host instead. net/http
// carries an override on Request.Host, which is safe: it changes the header
// without changing where the connection goes.
func TestHostHeaderOverridesTheRequestHost(t *testing.T) {
	headers := http.Header{}
	host, dropped := applyUserHeaders(headers, []model.KeyValue{
		{Key: "Host", Value: "internal.example.com", Enabled: true},
		{Key: "X-Normal", Value: "kept", Enabled: true},
	})

	if host != "internal.example.com" {
		t.Errorf("Host override = %q, want internal.example.com", host)
	}
	if headers.Get("X-Normal") != "kept" {
		t.Error("ordinary headers should still be applied")
	}
	if len(dropped) != 0 {
		t.Errorf("Host is supported, so nothing should be reported dropped: %v", dropped)
	}
}

// Framing headers stay unsendable, but silently dropping them sends the user
// debugging the server instead of their own request.
func TestFramingHeadersAreReportedRatherThanDroppedInSilence(t *testing.T) {
	headers := http.Header{}
	_, dropped := applyUserHeaders(headers, []model.KeyValue{
		{Key: "Content-Length", Value: "12", Enabled: true},
		{Key: "Transfer-Encoding", Value: "chunked", Enabled: true},
		{Key: "X-Normal", Value: "kept", Enabled: true},
	})

	if headers.Get("Content-Length") != "" || headers.Get("Transfer-Encoding") != "" {
		t.Fatal("framing headers must not reach the wire")
	}
	notice := droppedHeaderNotice(dropped)
	for _, want := range []string{"Content-Length", "Transfer-Encoding"} {
		if !strings.Contains(notice, want) {
			t.Errorf("notice %q does not name %s", notice, want)
		}
	}
	if droppedHeaderNotice(nil) != "" {
		t.Error("no dropped headers should produce no notice")
	}
}

// A disabled row is not a row the user is sending, so it must not produce a
// warning about not being sent.
func TestDisabledFramingHeaderProducesNoNotice(t *testing.T) {
	_, dropped := applyUserHeaders(http.Header{}, []model.KeyValue{
		{Key: "Connection", Value: "close", Enabled: false},
	})
	if len(dropped) != 0 {
		t.Errorf("disabled rows should be ignored entirely, got %v", dropped)
	}
}
