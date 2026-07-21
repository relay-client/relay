package api

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"os"
	"sync/atomic"
	"testing"
	"time"
)

func TestRequestStorePayloadRoundTrip(t *testing.T) {
	withIsolatedStore(t)

	plaintext := `{"hello":"world","n":42}`
	enc, err := encryptRequestStorePayload([]byte(plaintext))
	if err != nil {
		t.Fatalf("encrypt: %v", err)
	}
	if !isEncryptedRequestStore(enc) {
		t.Fatal("encrypted payload should be recognized as an encrypted envelope")
	}
	dec, err := decryptRequestStorePayload(enc)
	if err != nil {
		t.Fatalf("decrypt: %v", err)
	}
	if string(dec) != plaintext {
		t.Fatalf("round trip mismatch: got %q want %q", dec, plaintext)
	}
}

func TestRequestStorePayloadRandomNonce(t *testing.T) {
	withIsolatedStore(t)
	e1, err := encryptRequestStorePayload([]byte("same"))
	if err != nil {
		t.Fatalf("encrypt 1: %v", err)
	}
	e2, err := encryptRequestStorePayload([]byte("same"))
	if err != nil {
		t.Fatalf("encrypt 2: %v", err)
	}
	if bytes.Equal(e1, e2) {
		t.Fatal("encrypting the same plaintext twice should differ (random nonce)")
	}
}

func TestRequestStorePayloadTamperDetected(t *testing.T) {
	withIsolatedStore(t)
	enc, err := encryptRequestStorePayload([]byte("secret data"))
	if err != nil {
		t.Fatalf("encrypt: %v", err)
	}
	// Flip a byte deep inside the JSON envelope's ciphertext field; GCM must reject it.
	tampered := bytes.Replace(enc, []byte(`"ciphertext": "`), []byte(`"ciphertext": "A`), 1)
	if _, err := decryptRequestStorePayload(tampered); err == nil {
		t.Fatal("expected decrypt of tampered payload to fail authentication")
	}
}

func TestDecryptDoesNotCreateReplacementKeyWhenExistingKeyIsMissing(t *testing.T) {
	tmp := t.TempDir()
	t.Setenv("XDG_CONFIG_HOME", tmp)
	t.Setenv("HOME", tmp)
	t.Setenv(requestStoreDisableKeychain, "1")
	prevProvider := requestStoreKeyProvider
	prevLoader := requestStoreKeyLoader
	requestStoreKeyProvider = cachedRequestStoreKey
	requestStoreKeyLoader = cachedExistingRequestStoreKey
	t.Cleanup(func() {
		requestStoreKeyProvider = prevProvider
		requestStoreKeyLoader = prevLoader
	})

	clearRequestStoreKeyCacheForTest(t)
	key := bytes.Repeat([]byte{9}, requestStoreKeySize)
	gcm, err := requestStoreCipher(key)
	if err != nil {
		t.Fatalf("cipher: %v", err)
	}
	nonce := make([]byte, gcm.NonceSize())
	enc, err := json.MarshalIndent(requestStoreEnvelope{
		Version:    requestStoreEnvelopeVersion,
		Algorithm:  requestStoreAlgorithm,
		Nonce:      base64.StdEncoding.EncodeToString(nonce),
		Ciphertext: base64.StdEncoding.EncodeToString(gcm.Seal(nil, nonce, []byte("secret data"), nil)),
	}, "", "  ")
	if err != nil {
		t.Fatalf("marshal encrypted envelope: %v", err)
	}
	if err := os.Remove(requestStoreKeyPath()); err != nil && !os.IsNotExist(err) {
		t.Fatalf("remove key file: %v", err)
	}
	clearRequestStoreKeyCacheForTest(t)

	if _, err := decryptRequestStorePayload(enc); err == nil {
		t.Fatal("expected decrypt to fail when the existing key is missing")
	}
	if _, err := os.Stat(requestStoreKeyPath()); !os.IsNotExist(err) {
		t.Fatalf("decrypt should not create a replacement key, stat err=%v", err)
	}
}

// Refactor #1: the key must be memoized so encrypt/decrypt don't spawn a keychain
// subprocess every call. After the first load the on-disk key can disappear and
// the cached key is still returned (rather than generating a fresh random one).
func TestCachedRequestStoreKeyMemoizes(t *testing.T) {
	tmp := t.TempDir()
	t.Setenv("XDG_CONFIG_HOME", tmp)
	t.Setenv("HOME", tmp)
	t.Setenv(requestStoreDisableKeychain, "1")

	requestStoreKeyMu.Lock()
	prev := requestStoreKeyCache
	requestStoreKeyCache = nil
	requestStoreKeyMu.Unlock()
	t.Cleanup(func() {
		requestStoreKeyMu.Lock()
		requestStoreKeyCache = prev
		requestStoreKeyMu.Unlock()
	})

	k1, err := cachedRequestStoreKey()
	if err != nil {
		t.Fatalf("first load: %v", err)
	}
	k2, err := cachedRequestStoreKey()
	if err != nil {
		t.Fatalf("second load: %v", err)
	}
	if !bytes.Equal(k1, k2) {
		t.Fatal("cached key changed between calls")
	}

	if err := os.Remove(requestStoreKeyPath()); err != nil {
		t.Fatalf("remove key file: %v", err)
	}
	k3, err := cachedRequestStoreKey()
	if err != nil {
		t.Fatalf("third load: %v", err)
	}
	if !bytes.Equal(k1, k3) {
		t.Fatal("expected the cached key after the key file was removed, got a different key")
	}
}

func TestCachedRequestStoreKeyInitializesOnce(t *testing.T) {
	clearRequestStoreKeyCacheForTest(t)
	previousInitializer := requestStoreKeyInitializer
	t.Cleanup(func() {
		requestStoreKeyInitializer = previousInitializer
	})

	key := bytes.Repeat([]byte{7}, requestStoreKeySize)
	var calls atomic.Int32
	entered := make(chan struct{}, 2)
	release := make(chan struct{})
	requestStoreKeyInitializer = func(createIfMissing bool) ([]byte, error) {
		calls.Add(1)
		entered <- struct{}{}
		<-release
		return append([]byte(nil), key...), nil
	}

	results := make(chan []byte, 2)
	start := func() {
		result, err := cachedRequestStoreKeyFromStore(true)
		if err != nil {
			t.Errorf("load key: %v", err)
			results <- nil
			return
		}
		results <- result
	}

	go start()
	<-entered
	secondStarted := make(chan struct{})
	go func() {
		close(secondStarted)
		start()
	}()
	<-secondStarted

	concurrentInitialization := false
	select {
	case <-entered:
		concurrentInitialization = true
	case <-time.After(100 * time.Millisecond):
	}
	close(release)

	first := <-results
	second := <-results
	if concurrentInitialization {
		t.Fatal("request-store key initializer ran concurrently")
	}
	if calls.Load() != 1 {
		t.Fatalf("initializer called %d times, want 1", calls.Load())
	}
	if !bytes.Equal(first, key) || !bytes.Equal(second, key) {
		t.Fatalf("callers received different keys: %x %x", first, second)
	}
}

func clearRequestStoreKeyCacheForTest(t *testing.T) {
	t.Helper()
	requestStoreKeyMu.Lock()
	previous := requestStoreKeyCache
	requestStoreKeyCache = nil
	requestStoreKeyMu.Unlock()
	t.Cleanup(func() {
		requestStoreKeyMu.Lock()
		requestStoreKeyCache = previous
		requestStoreKeyMu.Unlock()
	})
}
