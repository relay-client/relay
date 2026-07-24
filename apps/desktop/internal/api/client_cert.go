package api

import (
	"crypto/tls"
	"crypto/x509"
	"encoding/pem"
	"fmt"
	"os"
	"strings"
	"sync"

	"github.com/relay-client/relay/apps/desktop/internal/model"
)

// clientCertConfig is the resolved mTLS material for one request. An empty
// config means no client certificate — the common case.
type clientCertConfig struct {
	certPath string
	keyPath  string
	password string
}

func clientCertConfigFor(req model.HttpRequest) clientCertConfig {
	return clientCertConfig{
		certPath: strings.TrimSpace(req.ClientCertPath),
		keyPath:  strings.TrimSpace(req.ClientKeyPath),
		password: req.ClientKeyPassword,
	}
}

func (c clientCertConfig) enabled() bool {
	return c.certPath != ""
}

// cacheKey identifies the certificate so the transport cache can keep separate
// connection pools per client identity, and so a parsed keypair is reused
// instead of re-read on every send.
func (c clientCertConfig) cacheKey() string {
	if !c.enabled() {
		return ""
	}
	return c.certPath + "\x00" + c.keyPath + "\x00" + c.password
}

type cachedClientCert struct {
	cert tls.Certificate
	err  error
}

type clientCertCache struct {
	mu      sync.Mutex
	entries map[string]cachedClientCert
}

func newClientCertCache() *clientCertCache {
	return &clientCertCache{entries: make(map[string]cachedClientCert)}
}

// clientCerts is process-wide: a parsed keypair is immutable and safe to share,
// and reusing it avoids re-reading the files on every request.
var clientCerts = newClientCertCache()

func (c *clientCertCache) load(config clientCertConfig) (tls.Certificate, error) {
	key := config.cacheKey()

	c.mu.Lock()
	if entry, ok := c.entries[key]; ok {
		c.mu.Unlock()
		return entry.cert, entry.err
	}
	c.mu.Unlock()

	cert, err := loadClientCertificate(config)

	c.mu.Lock()
	c.entries[key] = cachedClientCert{cert: cert, err: err}
	c.mu.Unlock()
	return cert, err
}

// forget drops a cached entry so a re-issued certificate at the same path is
// picked up without restarting the app.
func (c *clientCertCache) forget(config clientCertConfig) {
	c.mu.Lock()
	delete(c.entries, config.cacheKey())
	c.mu.Unlock()
}

func loadClientCertificate(config clientCertConfig) (tls.Certificate, error) {
	certPEM, err := os.ReadFile(config.certPath)
	if err != nil {
		return tls.Certificate{}, fmt.Errorf("client certificate: %w", err)
	}
	// A single combined PEM (cert + key in one file) is common, so default the
	// key file to the cert file when the user leaves it blank.
	keyPath := config.keyPath
	if keyPath == "" {
		keyPath = config.certPath
	}
	keyPEM, err := os.ReadFile(keyPath)
	if err != nil {
		return tls.Certificate{}, fmt.Errorf("client key: %w", err)
	}

	if config.password != "" {
		decrypted, decErr := decryptPEMPrivateKey(keyPEM, config.password)
		if decErr != nil {
			return tls.Certificate{}, decErr
		}
		keyPEM = decrypted
	}

	cert, err := tls.X509KeyPair(certPEM, keyPEM)
	if err != nil {
		// A legacy encrypted key with no password produces an opaque parse
		// error; point the user at the actual cause.
		if config.password == "" && pemHasEncryptedBlock(keyPEM) {
			return tls.Certificate{}, fmt.Errorf("client key is encrypted — enter its password")
		}
		return tls.Certificate{}, fmt.Errorf("client certificate/key pair is invalid: %w", err)
	}
	return cert, nil
}

// decryptPEMPrivateKey handles the legacy PEM encryption (RFC 1423, the
// "DEK-Info" header openssl writes) that Go's tls.X509KeyPair refuses to decrypt
// on its own. PKCS#8-encrypted keys are not supported here and report a clear
// error rather than a silent failure.
func decryptPEMPrivateKey(keyPEM []byte, password string) ([]byte, error) {
	block, _ := pem.Decode(keyPEM)
	if block == nil {
		return nil, fmt.Errorf("client key is not valid PEM")
	}
	//nolint:staticcheck // x509.IsEncryptedPEMBlock/DecryptPEMBlock are deprecated
	// but remain the only stdlib path for the openssl legacy key format users
	// still have on disk.
	if !x509.IsEncryptedPEMBlock(block) {
		if pemLooksPKCS8Encrypted(block) {
			return nil, fmt.Errorf("this key uses PKCS#8 encryption, which Relay cannot decrypt — convert it with: openssl pkcs8 -in key.pem -out key.dec.pem")
		}
		// Not encrypted after all; hand the original bytes back untouched.
		return keyPEM, nil
	}
	//nolint:staticcheck
	decrypted, err := x509.DecryptPEMBlock(block, []byte(password))
	if err != nil {
		return nil, fmt.Errorf("could not decrypt client key — check the password")
	}
	return pem.EncodeToMemory(&pem.Block{Type: block.Type, Bytes: decrypted}), nil
}

func pemHasEncryptedBlock(keyPEM []byte) bool {
	block, _ := pem.Decode(keyPEM)
	if block == nil {
		return false
	}
	//nolint:staticcheck
	return x509.IsEncryptedPEMBlock(block) || pemLooksPKCS8Encrypted(block)
}

func pemLooksPKCS8Encrypted(block *pem.Block) bool {
	return block != nil && strings.Contains(block.Type, "ENCRYPTED PRIVATE KEY")
}
