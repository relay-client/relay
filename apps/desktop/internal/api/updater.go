package api

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path"
	goruntime "runtime"
	"strings"
	"time"

	"aead.dev/minisign"
	"github.com/Masterminds/semver/v3"

	"github.com/minio/selfupdate"
	"github.com/relay-client/relay/apps/desktop/internal/model"
)

var githubRepo = "relay-client/relay"

// updatePublicKey is the minisign public key used to verify auto-updates. It is
// public information (the matching private key signs releases) and is embedded
// directly into the source so every build path — CI, local `make build*`, and
// `release-mac-local` — verifies signatures uniformly. Overridable via ldflags
// only to support tests / staging keys; release builds MUST NOT ship empty.
var updatePublicKey = "RWTEfMAu7tDsMMu7Q9SCX5HgAEsBo5KZJzwvbIcP/ZKb1YyTg+Csj+9P"

const (
	updateMetadataTimeout = 15 * time.Second
	updateDownloadTimeout = 10 * time.Minute
	// maxSignatureSize bounds the minisign signature download. Real
	// signatures are <200 bytes; 8KiB is a generous safety margin.
	maxSignatureSize = 8 * 1024
	// maxUpdateDownloadSize caps the binary download to defend against a
	// malicious or compromised release host that streams unbounded data.
	// Relay binaries are ~80MB; 512MB leaves headroom for future growth.
	maxUpdateDownloadSize = 512 * 1024 * 1024
)

// Sentinel errors so friendlyUpdateError can classify without substring
// matching on stdlib error strings.
var (
	errUpdateSignatureMissing  = errors.New("update signature missing")
	errUpdateSignatureMismatch = errors.New("update signature mismatch")
	errUpdateChecksumMismatch  = errors.New("update checksum mismatch")
	errUpdateVersionRollback   = errors.New("update version is not newer than the installed version")
	errUpdateURLNotTrusted     = errors.New("update url is not on the trusted releases host")
	errUpdateSignatureRequired = errors.New("update public key is not embedded in this build")
)

var (
	updateMetadataHTTPClient = newUpdateHTTPClient(updateMetadataTimeout)
	updateDownloadHTTPClient = newUpdateHTTPClient(updateDownloadTimeout)
)

// newUpdateHTTPClient builds an HTTP client that refuses redirects which leave
// the trusted github.com release host or downgrade to http://.
func newUpdateHTTPClient(timeout time.Duration) *http.Client {
	return &http.Client{
		Timeout: timeout,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= 10 {
				return errors.New("stopped after 10 redirects")
			}
			if req.URL.Scheme != "https" {
				return fmt.Errorf("refusing redirect to non-https url: %s", req.URL.Redacted())
			}
			if !isTrustedReleaseURL(req.URL) {
				return fmt.Errorf("refusing redirect outside releases host: %s", req.URL.Redacted())
			}
			return nil
		},
	}
}

// trustedReleaseURLOverride lets tests inject a custom predicate. nil in
// production builds; the real check below is used.
var trustedReleaseURLOverride func(*url.URL) bool

// isTrustedReleaseURL accepts only https URLs whose host is github.com (or
// objects.githubusercontent.com, which CDN-fronts release downloads) and whose
// path begins with the configured release repo. This pins both the manifest
// fetch and the binary/signature downloads to the expected origin.
func isTrustedReleaseURL(u *url.URL) bool {
	if trustedReleaseURLOverride != nil {
		return trustedReleaseURLOverride(u)
	}
	if u == nil || u.Scheme != "https" {
		return false
	}
	host := strings.ToLower(u.Hostname())
	switch host {
	case "github.com":
		// Path must begin with the configured release repo.
		prefix := "/" + strings.Trim(githubRepo, "/") + "/"
		return strings.HasPrefix(u.Path, prefix)
	case "objects.githubusercontent.com", "release-assets.githubusercontent.com":
		// GitHub redirects release downloads to these signed-URL hosts.
		return true
	}
	return false
}

type updateManifest struct {
	Version     string                    `json:"version"`
	Notes       string                    `json:"notes"`
	PublishedAt string                    `json:"published_at"`
	Platforms   map[string]updatePlatform `json:"platforms"`
}

type updatePlatform struct {
	URL       string `json:"url"`
	SHA256    string `json:"sha256"`
	Signature string `json:"signature,omitempty"`
}

func platformKey() string {
	os := goruntime.GOOS
	arch := goruntime.GOARCH
	if os == "darwin" {
		return "darwin-universal"
	}
	return fmt.Sprintf("%s-%s", os, arch)
}

// semverIsNewer reports whether `latest` is strictly newer than `current`,
// using semver-correct ordering (so 0.1.32 > 0.1.32-rc.1, and 0.1.32-rc.2 >
// 0.1.32-rc.1). Falls back to "latest is newer" on unparseable current
// versions like "dev" or empty.
func semverIsNewer(latest, current string) bool {
	current = strings.TrimSpace(strings.TrimPrefix(current, "v"))
	if current == "" || current == "dev" {
		return true
	}
	l, lerr := semver.NewVersion(strings.TrimPrefix(latest, "v"))
	c, cerr := semver.NewVersion(current)
	if lerr != nil || cerr != nil {
		return false
	}
	return l.GreaterThan(c)
}

func latestManifestURL() string {
	return fmt.Sprintf("https://github.com/%s/releases/latest/download/latest.json", githubRepo)
}

func updateMetadataRequest(ctx context.Context, method, url string) (*http.Response, error) {
	req, err := http.NewRequestWithContext(ctx, method, url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")
	return updateMetadataHTTPClient.Do(req)
}

func fetchLatestManifest(ctx context.Context) (*updateManifest, error) {
	return fetchUpdateManifest(ctx, latestManifestURL())
}

func fetchUpdateManifest(ctx context.Context, manifestURL string) (*updateManifest, error) {
	resp, err := updateMetadataRequest(ctx, http.MethodGet, manifestURL)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("update metadata returned %d", resp.StatusCode)
	}
	var manifest updateManifest
	if err := json.NewDecoder(io.LimitReader(resp.Body, 1<<20)).Decode(&manifest); err != nil {
		return nil, err
	}
	return &manifest, nil
}

func assetNameFromURL(rawURL, fallback string) string {
	parsed, err := url.Parse(rawURL)
	if err != nil {
		return fallback
	}
	name := path.Base(parsed.Path)
	if name == "." || name == "/" || name == "" {
		return fallback
	}
	return name
}

func checkForUpdate(ctx context.Context) (*model.UpdateInfo, error) {
	manifest, err := fetchLatestManifest(ctx)
	if err != nil {
		return nil, err
	}
	return updateInfoFromManifest(manifest)
}

func updateInfoFromManifest(manifest *updateManifest) (*model.UpdateInfo, error) {
	target := platformKey()
	platform, ok := manifest.Platforms[target]
	downloadURL := strings.TrimSpace(platform.URL)
	if !ok || downloadURL == "" {
		return nil, fmt.Errorf("no release asset found for %s", target)
	}
	checksum := strings.TrimSpace(platform.SHA256)
	if checksum == "" {
		return nil, fmt.Errorf("update checksum missing for %s", target)
	}
	signatureURL := strings.TrimSpace(platform.Signature)
	version := strings.TrimPrefix(manifest.Version, "v")
	if version == "" {
		return nil, errors.New("update metadata missing version")
	}
	return &model.UpdateInfo{
		Version:      version,
		ReleaseNotes: manifest.Notes,
		PublishedAt:  manifest.PublishedAt,
		DownloadURL:  downloadURL,
		AssetName:    assetNameFromURL(downloadURL, target),
		SHA256:       checksum,
		SignatureURL: signatureURL,
	}, nil
}

func verifySHA256(path string, expected string) error {
	expected = strings.TrimSpace(expected)
	if expected == "" {
		return errUpdateChecksumMismatch
	}
	file, err := os.Open(path)
	if err != nil {
		return err
	}
	defer file.Close()
	hash := sha256.New()
	if _, err := io.Copy(hash, file); err != nil {
		return err
	}
	actual := hex.EncodeToString(hash.Sum(nil))
	if !strings.EqualFold(actual, expected) {
		return errUpdateChecksumMismatch
	}
	return nil
}

func fetchUpdateSignature(ctx context.Context, signatureURL string) ([]byte, error) {
	parsed, err := url.Parse(signatureURL)
	if err != nil {
		return nil, fmt.Errorf("invalid signature url: %w", err)
	}
	if !isTrustedReleaseURL(parsed) {
		return nil, errUpdateURLNotTrusted
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, signatureURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "text/plain, application/octet-stream")
	resp, err := updateMetadataHTTPClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("signature download returned %d", resp.StatusCode)
	}
	return io.ReadAll(io.LimitReader(resp.Body, maxSignatureSize))
}

// verifyUpdateSignature fails closed: if the build has no embedded public key,
// it returns errUpdateSignatureRequired (in contrast to the previous behavior
// of silently skipping verification). Tests that need the no-key escape hatch
// must set updatePublicKey explicitly via ldflags or by overriding the var.
func verifyUpdateSignature(ctx context.Context, binaryPath, signatureURL, rawPublicKey string) error {
	rawPublicKey = strings.TrimSpace(rawPublicKey)
	if rawPublicKey == "" {
		return errUpdateSignatureRequired
	}
	if strings.TrimSpace(signatureURL) == "" {
		return errUpdateSignatureMissing
	}
	var publicKey minisign.PublicKey
	if err := publicKey.UnmarshalText([]byte(rawPublicKey)); err != nil {
		return fmt.Errorf("invalid embedded update public key: %w", err)
	}
	signature, err := fetchUpdateSignature(ctx, signatureURL)
	if err != nil {
		return err
	}
	file, err := os.Open(binaryPath)
	if err != nil {
		return err
	}
	defer file.Close()
	reader := minisign.NewReader(file)
	if _, err := io.Copy(io.Discard, reader); err != nil {
		return err
	}
	if !reader.Verify(publicKey, signature) {
		return errUpdateSignatureMismatch
	}
	return nil
}

// resolveTrustedUpdateInfo re-fetches the manifest from the trusted releases
// host and returns the platform-matched UpdateInfo, ignoring any caller-
// provided values. This is the authoritative source for ApplyUpdate; without
// it a caller in the Wails JS bridge could ask the backend to download an
// arbitrary URL with a self-supplied SHA256, turning the updater into an
// attacker-controlled fetcher.
func resolveTrustedUpdateInfo(ctx context.Context) (*model.UpdateInfo, error) {
	info, err := checkForUpdate(ctx)
	if err != nil {
		return nil, err
	}
	return info, nil
}

func downloadAndApply(ctx context.Context, info *model.UpdateInfo) error {
	parsed, err := url.Parse(info.DownloadURL)
	if err != nil {
		return fmt.Errorf("invalid download url: %w", err)
	}
	if !isTrustedReleaseURL(parsed) {
		return errUpdateURLNotTrusted
	}
	// Rollback protection: refuse to apply an update that is not strictly
	// newer than the running build. Combined with the manifest re-fetch in
	// ApplyUpdate, this blocks downgrade attacks via a tampered manifest
	// that points at an older (still validly signed) binary.
	if !isDevBuild() && !semverIsNewer(info.Version, appVersion) {
		return errUpdateVersionRollback
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, info.DownloadURL, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Accept", "application/octet-stream")

	resp, err := updateDownloadHTTPClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("download returned %d", resp.StatusCode)
	}

	tmp, err := os.CreateTemp("", "relay-update-*")
	if err != nil {
		return err
	}
	tmpPath := tmp.Name()
	defer os.Remove(tmpPath)

	if _, err := io.Copy(tmp, io.LimitReader(resp.Body, maxUpdateDownloadSize+1)); err != nil {
		_ = tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	if fi, statErr := os.Stat(tmpPath); statErr == nil && fi.Size() > maxUpdateDownloadSize {
		return fmt.Errorf("update download exceeds %d bytes", maxUpdateDownloadSize)
	}
	if err := verifySHA256(tmpPath, info.SHA256); err != nil {
		return err
	}
	if err := verifyUpdateSignature(ctx, tmpPath, info.SignatureURL, updatePublicKey); err != nil {
		return err
	}
	file, err := os.Open(tmpPath)
	if err != nil {
		return err
	}
	defer file.Close()
	// Pass the checksum to selfupdate as well so the library re-verifies
	// the bytes it's about to swap in, closing the small TOCTOU window
	// between our verify and selfupdate.Apply.
	checksum, decodeErr := hex.DecodeString(strings.TrimSpace(info.SHA256))
	opts := selfupdate.Options{}
	if decodeErr == nil {
		opts.Checksum = checksum
	}
	return selfupdate.Apply(file, opts)
}

func relaunchSelf() {
	exe, err := os.Executable()
	if err != nil {
		os.Exit(0)
	}
	if goruntime.GOOS == "darwin" {
		if idx := strings.Index(exe, ".app/Contents/MacOS/"); idx != -1 {
			appPath := exe[:idx+4]
			cmd := exec.Command("open", "-n", appPath)
			hideCmdWindow(cmd)
			_ = cmd.Start()
			os.Exit(0)
		}
	}
	cmd := exec.Command(exe)
	hideCmdWindow(cmd)
	_ = cmd.Start()
	os.Exit(0)
}

func friendlyUpdateError(err error, action string) string {
	if err == nil {
		return ""
	}
	base := "Could not " + action + "."
	if errors.Is(err, context.DeadlineExceeded) {
		return base + " The request timed out. Check your internet connection and try again."
	}
	var dnsErr *net.DNSError
	if errors.As(err, &dnsErr) {
		return base + " Relay could not reach the update service. Check your internet connection and try again."
	}
	switch {
	case errors.Is(err, errUpdateSignatureMissing),
		errors.Is(err, errUpdateSignatureMismatch),
		errors.Is(err, errUpdateChecksumMismatch),
		errors.Is(err, errUpdateSignatureRequired):
		return base + " The downloaded update could not be verified. Please try again later."
	case errors.Is(err, errUpdateURLNotTrusted):
		return base + " The update server returned an unexpected location. Please try again later."
	case errors.Is(err, errUpdateVersionRollback):
		return base + " The available update is not newer than the installed version."
	}
	lower := strings.ToLower(err.Error())
	switch {
	case strings.Contains(lower, "timeout"), strings.Contains(lower, "deadline exceeded"):
		return base + " The request timed out. Check your internet connection and try again."
	case strings.Contains(lower, "no such host"), strings.Contains(lower, "network is unreachable"):
		return base + " Relay could not reach the update service. Check your internet connection and try again."
	case strings.Contains(lower, "certificate"), strings.Contains(lower, "tls"):
		return base + " A secure connection could not be established. Check your network settings and try again."
	case strings.Contains(lower, "permission"), strings.Contains(lower, "access denied"):
		return base + " Relay does not have permission to replace the app. Try again after restarting the app."
	case strings.Contains(lower, "no release asset"):
		return base + " No compatible update package is available for this device yet."
	case strings.Contains(lower, "checksum"), strings.Contains(lower, "signature"):
		return base + " The downloaded update could not be verified. Please try again later."
	}
	return base + " Please try again in a moment."
}
