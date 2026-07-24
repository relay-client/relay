package api

import (
	"crypto/tls"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/relay-client/relay/apps/desktop/internal/model"
)

// maxCachedTransports bounds how many distinct transport configurations stay
// warm at once. A workspace realistically uses a handful — a proxy toggle
// here, an SSL-verify toggle there — so the cap only bites if something
// generates proxy URLs dynamically.
const maxCachedTransports = 16

// transportKey captures every request field that changes how the transport
// itself behaves. Two requests with equal keys can, and should, share pooled
// TCP and TLS connections; anything else must not.
type transportKey struct {
	httpVersion   string
	skipTLSVerify bool
	proxyMode     string
	proxyURL      string
	proxyBypass   string
	clientCert    string
}

func newTransportKey(req model.HttpRequest) transportKey {
	key := transportKey{
		httpVersion:   strings.ToLower(strings.TrimSpace(req.HTTPVersion)),
		skipTLSVerify: !req.EnableSSLVerification,
		proxyMode:     strings.ToLower(strings.TrimSpace(req.ProxyMode)),
		// A client certificate is part of the connection's identity: two
		// requests presenting different certs must never share a pooled
		// connection.
		clientCert: clientCertConfigFor(req).cacheKey(),
	}
	// "off" ignores the URL and bypass list entirely, so folding them into the
	// key would fragment the cache for no reason.
	if key.proxyMode != "off" {
		key.proxyURL = strings.TrimSpace(req.ProxyURL)
		key.proxyBypass = strings.TrimSpace(req.ProxyBypass)
	}
	return key
}

type cachedTransport struct {
	transport *http.Transport
	lastUsed  time.Time
}

// transportCache hands out one *http.Transport per configuration so that
// consecutive requests reuse connections.
//
// Building a fresh transport per request — the obvious thing to do, since the
// config is per-request — means every send pays a full TCP and TLS handshake,
// reports connect/TLS timings that never reflect a warm connection, and strands
// its idle connections inside a transport nobody will touch again. They then sit
// there until IdleConnTimeout (90s) expires. A 500-request collection run left
// 500 such transports behind, each holding sockets open.
type transportCache struct {
	mu      sync.Mutex
	entries map[transportKey]*cachedTransport
	now     func() time.Time
}

func newTransportCache() *transportCache {
	return &transportCache{
		entries: make(map[transportKey]*cachedTransport),
		now:     time.Now,
	}
}

// httpTransports is process-wide on purpose: connection pooling is a property
// of the process, the same way http.DefaultTransport is.
var httpTransports = newTransportCache()

func (c *transportCache) get(req model.HttpRequest) *http.Transport {
	key := newTransportKey(req)

	c.mu.Lock()
	defer c.mu.Unlock()

	if entry, ok := c.entries[key]; ok {
		entry.lastUsed = c.now()
		return entry.transport
	}

	transport := newBaseHTTPTransport(req)
	c.evictLocked()
	c.entries[key] = &cachedTransport{transport: transport, lastUsed: c.now()}
	return transport
}

// evictLocked drops the least recently used entry once the cache is full,
// releasing its idle sockets on the way out.
func (c *transportCache) evictLocked() {
	if len(c.entries) < maxCachedTransports {
		return
	}
	var oldestKey transportKey
	var oldest *cachedTransport
	for key, entry := range c.entries {
		if oldest == nil || entry.lastUsed.Before(oldest.lastUsed) {
			oldestKey, oldest = key, entry
		}
	}
	if oldest == nil {
		return
	}
	oldest.transport.CloseIdleConnections()
	delete(c.entries, oldestKey)
}

// closeAll releases every pooled connection. Called on shutdown, and by tests
// that need a clean pool.
func (c *transportCache) closeAll() {
	c.mu.Lock()
	defer c.mu.Unlock()
	for key, entry := range c.entries {
		entry.transport.CloseIdleConnections()
		delete(c.entries, key)
	}
}

// newBaseHTTPTransport builds the transport for one configuration. Callers get
// it through the cache and must treat the result as shared: mutating it would
// change requests already in flight.
func newBaseHTTPTransport(req model.HttpRequest) *http.Transport {
	baseTransport, _ := http.DefaultTransport.(*http.Transport)
	if baseTransport == nil {
		baseTransport = &http.Transport{}
	}
	transport := baseTransport.Clone()
	transport.ForceAttemptHTTP2 = req.HTTPVersion != "1.1"
	if req.HTTPVersion == "1.1" {
		transport.TLSNextProto = map[string]func(string, *tls.Conn) http.RoundTripper{}
	}
	// Always pin a minimum TLS version. Even when the user opts out of
	// certificate verification (a debugging affordance), accepting TLS 1.0/1.1
	// would expose them to known protocol attacks they didn't ask for.
	if !req.EnableSSLVerification {
		transport.TLSClientConfig = &tls.Config{InsecureSkipVerify: true, MinVersion: tls.VersionTLS12}
	} else if transport.TLSClientConfig == nil {
		transport.TLSClientConfig = &tls.Config{MinVersion: tls.VersionTLS12}
	} else if transport.TLSClientConfig.MinVersion < tls.VersionTLS12 {
		transport.TLSClientConfig = transport.TLSClientConfig.Clone()
		transport.TLSClientConfig.MinVersion = tls.VersionTLS12
	}
	// Present a client certificate for mutual TLS. A load error is surfaced
	// with a clear message before dialing (see validateClientCertificate); by
	// the time the transport is built the keypair is cached, so this is cheap.
	if config := clientCertConfigFor(req); config.enabled() {
		if cert, err := clientCerts.load(config); err == nil {
			cfg := transport.TLSClientConfig
			if cfg == nil {
				cfg = &tls.Config{MinVersion: tls.VersionTLS12}
				transport.TLSClientConfig = cfg
			}
			cfg.Certificates = []tls.Certificate{cert}
		}
	}
	transport.Proxy = proxyForRequest(req)
	return transport
}

// validateClientCertificate loads the request's client certificate ahead of
// dialing so a bad path or wrong password fails with a clear message instead of
// an opaque TLS handshake error. Returns "" when there is nothing to validate.
func validateClientCertificate(req model.HttpRequest) string {
	config := clientCertConfigFor(req)
	if !config.enabled() {
		return ""
	}
	if _, err := clientCerts.load(config); err != nil {
		// Don't cache a transient failure (e.g. a file mid-write): drop it so a
		// retry re-reads from disk.
		clientCerts.forget(config)
		return err.Error()
	}
	return ""
}

// sharedHTTPTransport returns the pooled transport for this request's
// configuration. The returned transport is shared — never mutate it.
func sharedHTTPTransport(req model.HttpRequest) *http.Transport {
	return httpTransports.get(req)
}
