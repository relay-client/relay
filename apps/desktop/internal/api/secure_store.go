package api

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"
)

const (
	requestStoreEnvelopeVersion = 1
	requestStoreAlgorithm       = "AES-256-GCM"
	requestStoreKeyService      = "Relay"
	requestStoreKeyAccount      = "request-store"
	requestStoreKeyFileName     = "request-store.key"
	requestStoreKeySize         = 32
	requestStoreDisableKeychain = "RELAY_DISABLE_KEYCHAIN"
)

type requestStoreEnvelope struct {
	Version    int    `json:"version"`
	Algorithm  string `json:"algorithm"`
	Nonce      string `json:"nonce"`
	Ciphertext string `json:"ciphertext"`
}

var (
	requestStoreKeyProvider = cachedRequestStoreKey
	requestStoreKeyLoader   = cachedExistingRequestStoreKey
)

var (
	requestStoreKeyMu          sync.Mutex
	requestStoreKeyCache       []byte
	requestStoreKeyInitializer = func(createIfMissing bool) ([]byte, error) {
		if createIfMissing {
			return loadOrCreateRequestStoreKey()
		}
		return loadRequestStoreKey()
	}
)

// cachedRequestStoreKey memoizes the request-store key for the process lifetime.
// Loading a key can spawn an OS credential-store subprocess, so without this
// cache the frequent autosave path would fork a process on every write. Decrypt
// uses cachedExistingRequestStoreKey so an existing encrypted store never causes
// a fresh random key to be created just because the old key cannot be found.
func cachedRequestStoreKey() ([]byte, error) {
	return cachedRequestStoreKeyFromStore(true)
}

func cachedExistingRequestStoreKey() ([]byte, error) {
	return cachedRequestStoreKeyFromStore(false)
}

func cachedRequestStoreKeyFromStore(createIfMissing bool) ([]byte, error) {
	requestStoreKeyMu.Lock()
	defer requestStoreKeyMu.Unlock()
	if requestStoreKeyCache != nil {
		return append([]byte(nil), requestStoreKeyCache...), nil
	}
	key, err := requestStoreKeyInitializer(createIfMissing)
	if err != nil {
		return nil, err
	}
	requestStoreKeyCache = append([]byte(nil), key...)
	return append([]byte(nil), requestStoreKeyCache...), nil
}

func cacheRequestStoreKey(key []byte) {
	requestStoreKeyMu.Lock()
	defer requestStoreKeyMu.Unlock()
	requestStoreKeyCache = append([]byte(nil), key...)
}

func loadRequestStorePayload(path string) (string, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}
	if !isEncryptedRequestStore(data) {
		return "", fmt.Errorf("request store is not encrypted")
	}
	plaintext, err := decryptRequestStorePayload(data)
	if err != nil {
		return "", err
	}
	return string(plaintext), nil
}

func saveRequestStorePayload(path string, payload string) error {
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return err
	}
	data, err := encryptRequestStorePayload([]byte(payload))
	if err != nil {
		return err
	}

	tmp, err := os.CreateTemp(dir, ".requests-*.tmp")
	if err != nil {
		return err
	}
	tmpPath := tmp.Name()
	cleanup := true
	defer func() {
		if cleanup {
			_ = os.Remove(tmpPath)
		}
	}()

	if _, err := tmp.Write(data); err != nil {
		_ = tmp.Close()
		return err
	}
	if err := tmp.Chmod(0600); err != nil {
		_ = tmp.Close()
		return err
	}
	if err := tmp.Sync(); err != nil {
		_ = tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	if err := os.Rename(tmpPath, path); err != nil {
		return err
	}
	cleanup = false
	if err := os.Chmod(path, 0600); err != nil {
		return err
	}
	return syncDir(dir)
}

func isEncryptedRequestStore(data []byte) bool {
	var envelope requestStoreEnvelope
	if err := json.Unmarshal(data, &envelope); err != nil {
		return false
	}
	return envelope.Version == requestStoreEnvelopeVersion &&
		envelope.Algorithm == requestStoreAlgorithm &&
		envelope.Nonce != "" &&
		envelope.Ciphertext != ""
}

func encryptRequestStorePayload(payload []byte) ([]byte, error) {
	key, err := requestStoreKeyProvider()
	if err != nil {
		return nil, err
	}
	gcm, err := requestStoreCipher(key)
	if err != nil {
		return nil, err
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return nil, err
	}
	envelope := requestStoreEnvelope{
		Version:    requestStoreEnvelopeVersion,
		Algorithm:  requestStoreAlgorithm,
		Nonce:      base64.StdEncoding.EncodeToString(nonce),
		Ciphertext: base64.StdEncoding.EncodeToString(gcm.Seal(nil, nonce, payload, nil)),
	}
	return json.MarshalIndent(envelope, "", "  ")
}

func decryptRequestStorePayload(data []byte) ([]byte, error) {
	var envelope requestStoreEnvelope
	if err := json.Unmarshal(data, &envelope); err != nil {
		return nil, err
	}
	if envelope.Version != requestStoreEnvelopeVersion || envelope.Algorithm != requestStoreAlgorithm {
		return nil, fmt.Errorf("unsupported request store encryption envelope")
	}
	key, err := requestStoreKeyLoader()
	if err != nil {
		return nil, err
	}
	gcm, err := requestStoreCipher(key)
	if err != nil {
		return nil, err
	}
	nonce, err := base64.StdEncoding.DecodeString(envelope.Nonce)
	if err != nil {
		return nil, err
	}
	ciphertext, err := base64.StdEncoding.DecodeString(envelope.Ciphertext)
	if err != nil {
		return nil, err
	}
	plaintext, err := gcm.Open(nil, nonce, ciphertext, nil)
	if err == nil {
		return plaintext, nil
	}
	// On any decrypt failure (authentication mismatch or otherwise), try the
	// file-based recovery key before giving up. The previous implementation
	// matched the stdlib error string ("cipher: message authentication
	// failed") which is not a stable API — when Go reworded it the fallback
	// would silently stop firing, and users whose keychain entry was lost
	// would see "store corrupted" instead of being recovered.
	if plaintext, fallbackErr := decryptRequestStorePayloadWithFileKey(nonce, ciphertext); fallbackErr == nil {
		return plaintext, nil
	}
	return nil, err
}

func requestStoreCipher(key []byte) (cipher.AEAD, error) {
	if len(key) != requestStoreKeySize {
		return nil, fmt.Errorf("request store key must be %d bytes", requestStoreKeySize)
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	return cipher.NewGCM(block)
}

func decryptRequestStorePayloadWithFileKey(nonce []byte, ciphertext []byte) ([]byte, error) {
	material, err := loadRequestStoreFileKeyMaterial()
	if err != nil {
		return nil, err
	}
	key, err := decodeRequestStoreKey(material)
	if err != nil {
		return nil, err
	}
	gcm, err := requestStoreCipher(key)
	if err != nil {
		return nil, err
	}
	plaintext, err := gcm.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return nil, err
	}
	cacheRequestStoreKey(key)
	return plaintext, nil
}

func isRequestStoreAuthenticationError(err error) bool {
	return err != nil && strings.Contains(err.Error(), "cipher: message authentication failed")
}

func backupRequestStoreForRecovery(path string) (string, error) {
	data, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return "", nil
	}
	if err != nil {
		return "", err
	}
	dir := filepath.Dir(path)
	base := filepath.Base(path)
	stamp := time.Now().Format("20060102-150405")
	for i := 0; i < 100; i++ {
		suffix := fmt.Sprintf(".recovery-%s.bak", stamp)
		if i > 0 {
			suffix = fmt.Sprintf(".recovery-%s-%02d.bak", stamp, i)
		}
		backupPath := filepath.Join(dir, base+suffix)
		file, err := os.OpenFile(backupPath, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
		if errors.Is(err, os.ErrExist) {
			continue
		}
		if err != nil {
			return "", err
		}
		if _, err := file.Write(data); err != nil {
			_ = file.Close()
			_ = os.Remove(backupPath)
			return "", err
		}
		if err := file.Close(); err != nil {
			_ = os.Remove(backupPath)
			return "", err
		}
		if err := syncDir(dir); err != nil {
			return "", err
		}
		return backupPath, nil
	}
	return "", fmt.Errorf("could not create a unique request store recovery backup")
}

func loadOrCreateRequestStoreKey() ([]byte, error) {
	key, err := loadRequestStoreKey()
	if err == nil {
		return key, nil
	}
	key = make([]byte, requestStoreKeySize)
	if _, readErr := io.ReadFull(rand.Reader, key); readErr != nil {
		return nil, readErr
	}
	if saveErr := saveRequestStoreKeyMaterial(base64.StdEncoding.EncodeToString(key)); saveErr != nil {
		return nil, errors.Join(err, saveErr)
	}
	return key, nil
}

func loadRequestStoreKey() ([]byte, error) {
	material, fromFileFallback, err := loadRequestStoreKeyMaterialWithSource()
	if err != nil {
		return nil, err
	}
	key, decodeErr := decodeRequestStoreKey(material)
	if decodeErr != nil {
		return nil, decodeErr
	}

	if fromFileFallback && osCredentialStoreAvailable() {
		if saveErr := saveRequestStoreKeyMaterial(material); saveErr != nil {
			log.Printf("relay: could not migrate key to OS credential store (%v)", saveErr)
		}
	}
	return key, nil
}

func osCredentialStoreAvailable() bool {
	if requestStoreKeychainDisabled() {
		return false
	}
	switch runtime.GOOS {
	case "darwin", "windows":
		return true
	case "linux":
		_, err := exec.LookPath("secret-tool")
		return err == nil
	}
	return false
}

func decodeRequestStoreKey(material string) ([]byte, error) {
	key, err := base64.StdEncoding.DecodeString(strings.TrimSpace(material))
	if err != nil {
		return nil, err
	}
	if len(key) != requestStoreKeySize {
		return nil, fmt.Errorf("request store key must decode to %d bytes", requestStoreKeySize)
	}
	return key, nil
}

func loadRequestStoreKeyMaterialWithSource() (material string, fromFileFallback bool, err error) {
	if !requestStoreKeychainDisabled() {
		switch runtime.GOOS {
		case "darwin":
			if m, kerr := loadRequestStoreKeychainMaterial(); kerr == nil {
				return m, false, nil
			} else {
				log.Printf("relay: keychain unavailable (%v), falling back to file-based key storage", kerr)
			}
		case "linux":
			if m, kerr := loadRequestStoreSecretToolMaterial(); kerr == nil {
				return m, false, nil
			} else if !errors.Is(kerr, errSecretToolUnavailable) {
				log.Printf("relay: libsecret unavailable (%v), falling back to file-based key storage", kerr)
			}
		case "windows":
			if m, kerr := loadRequestStoreDPAPIMaterial(); kerr == nil {
				return m, false, nil
			} else if !errors.Is(kerr, os.ErrNotExist) {
				log.Printf("relay: DPAPI unavailable (%v), falling back to file-based key storage", kerr)
			}
		}
	}
	m, ferr := loadRequestStoreFileKeyMaterial()
	return m, ferr == nil, ferr
}

// saveRequestStoreKeyMaterial writes the encryption-key material to the OS
// credential store when available, falling back to a plaintext file.
//
// The file-based key is intentionally kept as a recovery copy even after a
// successful credential-store write. If the user later clears the credential
// store (logging out, wiping keychain, re-installing the OS), removing the
// file backup would render every previously-encrypted secret unreadable —
// silent data loss. The file is mode 0600 in the user's app-data dir, which
// matches the threat model we already accept when no credential store is
// reachable at all.
func saveRequestStoreKeyMaterial(material string) error {
	credStoreOK := false
	if !requestStoreKeychainDisabled() {
		switch runtime.GOOS {
		case "darwin":
			if err := saveRequestStoreKeychainMaterial(material); err == nil {
				credStoreOK = true
			} else {
				log.Printf("relay: failed to save encryption key to keychain (%v), falling back to file-based key storage", err)
			}
		case "linux":
			if err := saveRequestStoreSecretToolMaterial(material); err == nil {
				credStoreOK = true
			} else if !errors.Is(err, errSecretToolUnavailable) {
				log.Printf("relay: failed to save encryption key via libsecret (%v), falling back to file-based key storage", err)
			}
		case "windows":
			if err := saveRequestStoreDPAPIMaterial(material); err == nil {
				credStoreOK = true
			} else {
				log.Printf("relay: failed to save encryption key via DPAPI (%v), falling back to file-based key storage", err)
			}
		}
	}
	// Always keep a file-based copy as a recovery backup. Loss of the
	// credential store entry must not destroy access to existing data.
	if err := saveRequestStoreFileKeyMaterial(material); err != nil {
		if credStoreOK {
			// Credential store worked, file backup didn't. Log and keep
			// going — we still have a working copy of the key.
			log.Printf("relay: could not write recovery key file (%v); credential store entry will be the only copy", err)
			return nil
		}
		return err
	}
	return nil
}

func requestStoreKeychainDisabled() bool {
	switch strings.ToLower(strings.TrimSpace(os.Getenv(requestStoreDisableKeychain))) {
	case "1", "true", "yes", "on":
		return true
	default:
		return false
	}
}

func loadRequestStoreKeychainMaterial() (string, error) {
	cmd := exec.Command(
		"/usr/bin/security",
		"find-generic-password",
		"-s", requestStoreKeyService,
		"-a", requestStoreKeyAccount,
		"-w",
	)
	hideCmdWindow(cmd)
	output, err := cmd.Output()
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(string(output)), nil
}

func saveRequestStoreKeychainMaterial(material string) error {
	cmd := exec.Command(
		"/usr/bin/security",
		"add-generic-password",
		"-s", requestStoreKeyService,
		"-a", requestStoreKeyAccount,
		"-w", material,
		"-U",
	)
	hideCmdWindow(cmd)
	return cmd.Run()
}

func loadRequestStoreFileKeyMaterial() (string, error) {
	data, err := os.ReadFile(requestStoreKeyPath())
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(string(data)), nil
}

func saveRequestStoreFileKeyMaterial(material string) error {
	if err := os.MkdirAll(requestStoreDir(), 0755); err != nil {
		return err
	}
	if runtime.GOOS != "darwin" && runtime.GOOS != "windows" && runtime.GOOS != "linux" {
		log.Printf("relay: storing encryption key as a plain file in %s; protect this directory from other users", requestStoreDir())
	}
	if err := os.WriteFile(requestStoreKeyPath(), []byte(material), 0600); err != nil {
		return err
	}
	return syncDir(requestStoreDir())
}

var errSecretToolUnavailable = errors.New("secret-tool not available")

func loadRequestStoreSecretToolMaterial() (string, error) {
	if _, err := exec.LookPath("secret-tool"); err != nil {
		return "", errSecretToolUnavailable
	}
	cmd := exec.Command(
		"secret-tool", "lookup",
		"service", requestStoreKeyService,
		"account", requestStoreKeyAccount,
	)
	hideCmdWindow(cmd)
	output, err := cmd.Output()
	if err != nil {
		return "", err
	}
	value := strings.TrimSpace(string(output))
	if value == "" {
		return "", fmt.Errorf("secret-tool returned no value")
	}
	return value, nil
}

func saveRequestStoreSecretToolMaterial(material string) error {
	if _, err := exec.LookPath("secret-tool"); err != nil {
		return errSecretToolUnavailable
	}
	cmd := exec.Command(
		"secret-tool", "store",
		"--label", "Relay request store key",
		"service", requestStoreKeyService,
		"account", requestStoreKeyAccount,
	)
	hideCmdWindow(cmd)

	cmd.Stdin = strings.NewReader(material)
	return cmd.Run()
}

func requestStoreDPAPIKeyPath() string {
	return filepath.Join(requestStoreDir(), requestStoreKeyFileName+".dpapi")
}

func loadRequestStoreDPAPIMaterial() (string, error) {
	if runtime.GOOS != "windows" {
		return "", fmt.Errorf("DPAPI is only available on Windows")
	}
	data, err := os.ReadFile(requestStoreDPAPIKeyPath())
	if err != nil {
		return "", err
	}
	script := `$ErrorActionPreference='Stop'; $enc=[Console]::In.ReadToEnd().Trim(); ` +
		`$sec=ConvertTo-SecureString -String $enc; ` +
		`$bstr=[System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec); ` +
		`try { [Console]::Out.Write([System.Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)) } ` +
		`finally { [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }`
	cmd := exec.Command("powershell.exe", "-NoProfile", "-NonInteractive", "-Command", script)
	hideCmdWindow(cmd)
	cmd.Stdin = strings.NewReader(string(data))
	output, err := cmd.Output()
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(string(output)), nil
}

func saveRequestStoreDPAPIMaterial(material string) error {
	if runtime.GOOS != "windows" {
		return fmt.Errorf("DPAPI is only available on Windows")
	}
	if err := os.MkdirAll(requestStoreDir(), 0755); err != nil {
		return err
	}
	script := `$ErrorActionPreference='Stop'; $plain=[Console]::In.ReadToEnd().Trim(); ` +
		`$sec=ConvertTo-SecureString -String $plain -AsPlainText -Force; ` +
		`[Console]::Out.Write((ConvertFrom-SecureString -SecureString $sec))`
	cmd := exec.Command("powershell.exe", "-NoProfile", "-NonInteractive", "-Command", script)
	hideCmdWindow(cmd)
	cmd.Stdin = strings.NewReader(material)
	output, err := cmd.Output()
	if err != nil {
		return err
	}
	encrypted := strings.TrimSpace(string(output))
	if encrypted == "" {
		return fmt.Errorf("DPAPI returned an empty ciphertext")
	}
	path := requestStoreDPAPIKeyPath()
	if err := os.WriteFile(path, []byte(encrypted), 0600); err != nil {
		return err
	}
	// Intentionally do not delete the plaintext recovery key — see comment
	// on saveRequestStoreKeyMaterial.
	return syncDir(requestStoreDir())
}

func requestStoreKeyPath() string {
	return filepath.Join(requestStoreDir(), requestStoreKeyFileName)
}
