package api

import (
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	goruntime "runtime"
	"strings"
	"testing"
)

func TestAppBundleFromExecutable(t *testing.T) {
	cases := map[string]string{
		"/Applications/Kurlo.app/Contents/MacOS/kurlo":        "/Applications/Kurlo.app",
		"/Users/ada/Apps/Kurlo Beta.app/Contents/MacOS/kurlo": "/Users/ada/Apps/Kurlo Beta.app",
		"/usr/local/bin/kurlo":                                "",
		`C:\Program Files\Kurlo\kurlo.exe`:                    "",
	}
	for exe, want := range cases {
		if got := appBundleFromExecutable(exe); got != want {
			t.Errorf("appBundleFromExecutable(%q) = %q, want %q", exe, got, want)
		}
	}
}

func TestUpdatePlatformKeysPreferTheBundleInsideAMacApp(t *testing.T) {
	if got := updatePlatformKeys("darwin", "/Applications/Kurlo.app", "darwin-universal"); strings.Join(got, ",") != "darwin-universal-app,darwin-universal" {
		t.Fatalf("a Mac app should ask for the whole bundle first, got %v", got)
	}
	if got := updatePlatformKeys("darwin", "", "darwin-universal"); strings.Join(got, ",") != "darwin-universal" {
		t.Fatalf("a bare binary has no bundle to replace, got %v", got)
	}
	if got := updatePlatformKeys("windows", "", "windows-amd64"); strings.Join(got, ",") != "windows-amd64" {
		t.Fatalf("other platforms keep their key, got %v", got)
	}
}

func TestUpdateInfoFromManifestPrefersTheBundleArchive(t *testing.T) {
	manifest := &updateManifest{
		Version: "v2.1.0",
		Platforms: map[string]updatePlatform{
			"darwin-universal":     {URL: "https://github.com/stormhop/kurlo/releases/download/v2.1.0/kurlo-darwin-universal", SHA256: "aa", Signature: "https://github.com/stormhop/kurlo/releases/download/v2.1.0/kurlo-darwin-universal.minisig"},
			"darwin-universal-app": {URL: "https://github.com/stormhop/kurlo/releases/download/v2.1.0/kurlo-darwin-universal.app.zip", SHA256: "bb", Signature: "https://github.com/stormhop/kurlo/releases/download/v2.1.0/kurlo-darwin-universal.app.zip.minisig"},
		},
	}
	info, err := updateInfoFromManifestFor(manifest, []string{"darwin-universal-app", "darwin-universal"})
	if err != nil {
		t.Fatal(err)
	}
	if info.SHA256 != "bb" || !isBundleArchive(info.AssetName) || !strings.HasSuffix(info.SignatureURL, ".app.zip.minisig") {
		t.Fatalf("expected the bundle archive, got %+v", info)
	}

	delete(manifest.Platforms, "darwin-universal-app")
	info, err = updateInfoFromManifestFor(manifest, []string{"darwin-universal-app", "darwin-universal"})
	if err != nil {
		t.Fatal(err)
	}
	if info.SHA256 != "aa" || isBundleArchive(info.AssetName) {
		t.Fatalf("a release without a bundle should fall back to the binary, got %+v", info)
	}
}

func TestBundleArchiveURLsPointAtTheVersionsRelease(t *testing.T) {
	archive, signature := bundleArchiveURLs("stormhop/kurlo", "v2.0.1")
	if archive != "https://github.com/stormhop/kurlo/releases/download/v2.0.1/kurlo-darwin-universal.app.zip" {
		t.Fatalf("unexpected archive URL %q", archive)
	}
	if signature != archive+".minisig" {
		t.Fatalf("unexpected signature URL %q", signature)
	}
}

func requireBundleTools(t *testing.T) {
	t.Helper()
	if goruntime.GOOS != "darwin" {
		t.Skip("app bundles are a macOS concept")
	}
	for _, tool := range []string{"ditto", "plutil"} {
		if _, err := exec.LookPath(tool); err != nil {
			t.Skipf("%s is not available", tool)
		}
	}
}

func writeFakeBundle(t *testing.T, bundle, version, marker string) {
	t.Helper()
	for _, dir := range []string{"Contents/MacOS", "Contents/Resources"} {
		if err := os.MkdirAll(filepath.Join(bundle, dir), 0o755); err != nil {
			t.Fatal(err)
		}
	}
	plist := `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleExecutable</key><string>kurlo</string>
<key>CFBundleShortVersionString</key><string>` + version + `</string>
</dict></plist>
`
	files := map[string]string{
		"Contents/Info.plist":              plist,
		"Contents/MacOS/kurlo":             "binary " + marker,
		"Contents/Resources/iconfile.icns": "icon " + marker,
	}
	for name, body := range files {
		if err := os.WriteFile(filepath.Join(bundle, name), []byte(body), 0o755); err != nil {
			t.Fatal(err)
		}
	}
}

func zipBundle(t *testing.T, bundle string) string {
	t.Helper()
	archive := filepath.Join(t.TempDir(), "kurlo-darwin-universal.app.zip")
	if out, err := exec.Command("ditto", "-c", "-k", "--keepParent", bundle, archive).CombinedOutput(); err != nil {
		t.Fatalf("zip bundle: %v: %s", err, out)
	}
	return archive
}

func readFile(t *testing.T, path string) string {
	t.Helper()
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	return string(data)
}

func assertNoStagingLeft(t *testing.T, bundle string) {
	t.Helper()
	entries, err := os.ReadDir(bundle)
	if err != nil {
		t.Fatal(err)
	}
	for _, entry := range entries {
		if strings.HasPrefix(entry.Name(), ".kurlo-update-") {
			t.Fatalf("staging directory %s was left inside the bundle", entry.Name())
		}
	}
}

func TestApplyBundleUpdateReplacesTheWholeBundle(t *testing.T) {
	requireBundleTools(t)
	installed := filepath.Join(t.TempDir(), "Kurlo.app")
	writeFakeBundle(t, installed, "1.8.1", "old")
	release := filepath.Join(t.TempDir(), "Kurlo.app")
	writeFakeBundle(t, release, "2.0.1", "new")

	if err := applyBundleUpdate(zipBundle(t, release), installed, "v2.0.1"); err != nil {
		t.Fatalf("apply bundle update: %v", err)
	}

	if got := readFile(t, filepath.Join(installed, "Contents/Resources/iconfile.icns")); got != "icon new" {
		t.Fatalf("the icon was not replaced: %q", got)
	}
	if got := readFile(t, filepath.Join(installed, "Contents/MacOS/kurlo")); got != "binary new" {
		t.Fatalf("the binary was not replaced: %q", got)
	}
	version, err := plistShortVersion(filepath.Join(installed, "Contents/Info.plist"))
	if err != nil || version != "2.0.1" {
		t.Fatalf("Info.plist was not replaced: %q %v", version, err)
	}
	info, err := os.Stat(filepath.Join(installed, "Contents/MacOS/kurlo"))
	if err != nil || info.Mode().Perm()&0o100 == 0 {
		t.Fatalf("the binary lost its executable bit: %v %v", info, err)
	}
	assertNoStagingLeft(t, installed)
}

func TestApplyBundleUpdateRefusesAnotherVersion(t *testing.T) {
	requireBundleTools(t)
	installed := filepath.Join(t.TempDir(), "Kurlo.app")
	writeFakeBundle(t, installed, "1.8.1", "old")
	release := filepath.Join(t.TempDir(), "Kurlo.app")
	writeFakeBundle(t, release, "2.0.0", "new")

	err := applyBundleUpdate(zipBundle(t, release), installed, "2.0.1")
	if !errors.Is(err, errUpdateBundleMismatch) {
		t.Fatalf("expected a version mismatch, got %v", err)
	}
	if got := readFile(t, filepath.Join(installed, "Contents/Resources/iconfile.icns")); got != "icon old" {
		t.Fatalf("a refused update must leave the bundle alone, got %q", got)
	}
	assertNoStagingLeft(t, installed)
}

func TestApplyBundleUpdateRefusesAnArchiveWithoutAnApp(t *testing.T) {
	requireBundleTools(t)
	installed := filepath.Join(t.TempDir(), "Kurlo.app")
	writeFakeBundle(t, installed, "1.8.1", "old")
	notAnApp := filepath.Join(t.TempDir(), "payload")
	if err := os.MkdirAll(notAnApp, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(notAnApp, "readme.txt"), []byte("hello"), 0o644); err != nil {
		t.Fatal(err)
	}

	err := applyBundleUpdate(zipBundle(t, notAnApp), installed, "")
	if !errors.Is(err, errUpdateBundleInvalid) {
		t.Fatalf("expected an invalid bundle, got %v", err)
	}
	if got := readFile(t, filepath.Join(installed, "Contents/MacOS/kurlo")); got != "binary old" {
		t.Fatalf("a refused update must leave the bundle alone, got %q", got)
	}
}

func TestSwapBundleContentsRestoresTheOldContentsOnFailure(t *testing.T) {
	bundle := filepath.Join(t.TempDir(), "Kurlo.app")
	if err := os.MkdirAll(filepath.Join(bundle, "Contents"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(bundle, "Contents", "marker"), []byte("old"), 0o644); err != nil {
		t.Fatal(err)
	}
	stage := filepath.Join(bundle, ".kurlo-update-test")
	if err := os.MkdirAll(stage, 0o755); err != nil {
		t.Fatal(err)
	}

	if err := swapBundleContents(bundle, filepath.Join(stage, "missing", "Contents"), stage); err == nil {
		t.Fatal("expected the swap to fail when the new contents are missing")
	}
	if got := readFile(t, filepath.Join(bundle, "Contents", "marker")); got != "old" {
		t.Fatalf("the old contents were not restored: %q", got)
	}
}
