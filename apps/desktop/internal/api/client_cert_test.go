package api

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/pem"
	"math/big"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/relay-client/relay/apps/desktop/internal/model"
)

// issueCert mints a self-signed certificate and returns its PEM cert and key.
func issueCert(t *testing.T, commonName string) (certPEM, keyPEM []byte, cert tls.Certificate) {
	t.Helper()
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatalf("generate key: %v", err)
	}
	template := x509.Certificate{
		SerialNumber: big.NewInt(time.Now().UnixNano()),
		Subject:      pkix.Name{CommonName: commonName},
		NotBefore:    time.Now().Add(-time.Hour),
		NotAfter:     time.Now().Add(time.Hour),
		KeyUsage:     x509.KeyUsageDigitalSignature | x509.KeyUsageCertSign,
		ExtKeyUsage:  []x509.ExtKeyUsage{x509.ExtKeyUsageClientAuth, x509.ExtKeyUsageServerAuth},
		DNSNames:     []string{"127.0.0.1", "localhost"},
		IsCA:         true,
	}
	der, err := x509.CreateCertificate(rand.Reader, &template, &template, &key.PublicKey, key)
	if err != nil {
		t.Fatalf("create cert: %v", err)
	}
	keyDER, err := x509.MarshalPKCS8PrivateKey(key)
	if err != nil {
		t.Fatalf("marshal key: %v", err)
	}
	certPEM = pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der})
	keyPEM = pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: keyDER})
	pair, err := tls.X509KeyPair(certPEM, keyPEM)
	if err != nil {
		t.Fatalf("keypair: %v", err)
	}
	return certPEM, keyPEM, pair
}

func writeTemp(t *testing.T, dir, name string, data []byte) string {
	t.Helper()
	path := filepath.Join(dir, name)
	if err := os.WriteFile(path, data, 0o600); err != nil {
		t.Fatalf("write %s: %v", name, err)
	}
	return path
}

// mTLSServer starts an HTTPS server that requires and verifies a client
// certificate against the given pool.
func mTLSServer(t *testing.T, clientCA *x509.CertPool) *httptest.Server {
	t.Helper()
	server := httptest.NewUnstartedServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("client=" + r.TLS.PeerCertificates[0].Subject.CommonName))
	}))
	server.TLS = &tls.Config{
		ClientAuth: tls.RequireAndVerifyClientCert,
		ClientCAs:  clientCA,
		MinVersion: tls.VersionTLS12,
	}
	server.StartTLS()
	t.Cleanup(server.Close)
	return server
}

func mTLSTestRequest(url, certPath, keyPath string) model.HttpRequest {
	return model.HttpRequest{
		Method:                http.MethodGet,
		URL:                   url,
		FollowRedirects:       true,
		TimeoutMs:             5000,
		HTTPVersion:           "auto",
		EnableSSLVerification: false, // self-signed server cert; the point of the test is the client cert
		MaxRedirects:          10,
		ClientCertPath:        certPath,
		ClientKeyPath:         keyPath,
	}
}

func TestClientCertificateIsPresentedForMutualTLS(t *testing.T) {
	clientCerts = newClientCertCache()
	httpTransports.closeAll()
	t.Cleanup(httpTransports.closeAll)

	certPEM, keyPEM, clientCert := issueCert(t, "relay-client")
	pool := x509.NewCertPool()
	pool.AddCert(clientCert.Leaf)
	server := mTLSServer(t, pool)

	dir := t.TempDir()
	certPath := writeTemp(t, dir, "client.crt", certPEM)
	keyPath := writeTemp(t, dir, "client.key", keyPEM)

	resp := NewApp().SendRequest(mTLSTestRequest(server.URL, certPath, keyPath))
	if resp.Error != "" {
		t.Fatalf("mTLS request failed: %s", resp.Error)
	}
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
	if resp.Body != "client=relay-client" {
		t.Fatalf("server did not see the client cert: %q", resp.Body)
	}
}

// Without a client certificate the same server must reject the handshake, so
// this proves the success case above was actually driven by the cert.
func TestMutualTLSServerRejectsRequestWithoutCert(t *testing.T) {
	_, _, clientCert := issueCert(t, "relay-client")
	pool := x509.NewCertPool()
	pool.AddCert(clientCert.Leaf)
	server := mTLSServer(t, pool)

	req := mTLSTestRequest(server.URL, "", "")
	resp := NewApp().SendRequest(req)
	if resp.Error == "" {
		t.Fatal("expected the handshake to be rejected without a client cert")
	}
}

func TestClientCertificateMissingFileReportsClearError(t *testing.T) {
	clientCerts = newClientCertCache()
	resp := NewApp().SendRequest(mTLSTestRequest("https://example.com", "/no/such/cert.pem", "/no/such/key.pem"))
	if resp.Error == "" {
		t.Fatal("expected an error for a missing certificate file")
	}
	if !containsSubstr(resp.Error, "client certificate") {
		t.Fatalf("expected a client-certificate error, got %q", resp.Error)
	}
}

func TestClientCertificateEncryptedKeyNeedsPassword(t *testing.T) {
	clientCerts = newClientCertCache()
	dir := t.TempDir()
	certPEM, keyPEM, _ := issueCert(t, "enc-client")

	// Encrypt the key with the legacy PEM scheme so we can prove the
	// password path and the "needs a password" message.
	block, _ := pem.Decode(keyPEM)
	//nolint:staticcheck // legacy format is intentional here
	encBlock, err := x509.EncryptPEMBlock(rand.Reader, block.Type, block.Bytes, []byte("s3cret"), x509.PEMCipherAES256)
	if err != nil {
		t.Fatalf("encrypt key: %v", err)
	}
	encKeyPEM := pem.EncodeToMemory(encBlock)

	certPath := writeTemp(t, dir, "client.crt", certPEM)
	keyPath := writeTemp(t, dir, "client.key", encKeyPEM)

	// No password: clear guidance, not an opaque parse error.
	noPass := mTLSTestRequest("https://example.com", certPath, keyPath)
	if msg := validateClientCertificate(noPass); !containsSubstr(msg, "password") {
		t.Fatalf("expected a password hint, got %q", msg)
	}

	// Wrong password: rejected.
	clientCerts = newClientCertCache()
	wrong := noPass
	wrong.ClientKeyPassword = "nope"
	if msg := validateClientCertificate(wrong); msg == "" {
		t.Fatal("expected a wrong-password error")
	}

	// Correct password: loads.
	clientCerts = newClientCertCache()
	right := noPass
	right.ClientKeyPassword = "s3cret"
	if msg := validateClientCertificate(right); msg != "" {
		t.Fatalf("expected the encrypted key to load with the right password, got %q", msg)
	}
}

// Different client certs must not share a pooled connection.
func TestTransportKeySeparatesClientCertificates(t *testing.T) {
	base := mTLSTestRequest("https://example.com", "/certs/a.pem", "/certs/a.key")
	other := mTLSTestRequest("https://example.com", "/certs/b.pem", "/certs/b.key")
	none := mTLSTestRequest("https://example.com", "", "")

	if newTransportKey(base) == newTransportKey(other) {
		t.Fatal("expected different transport keys for different client certs")
	}
	if newTransportKey(base) == newTransportKey(none) {
		t.Fatal("expected a cert-bearing request to differ from one without a cert")
	}
	if newTransportKey(base) != newTransportKey(base) {
		t.Fatal("expected identical requests to share a transport key")
	}
}

func containsSubstr(haystack, needle string) bool {
	return len(needle) == 0 || (len(haystack) >= len(needle) && indexOf(haystack, needle) >= 0)
}

func indexOf(haystack, needle string) int {
	for i := 0; i+len(needle) <= len(haystack); i++ {
		if haystack[i:i+len(needle)] == needle {
			return i
		}
	}
	return -1
}
