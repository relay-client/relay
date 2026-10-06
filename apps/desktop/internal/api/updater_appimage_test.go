package api

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	goruntime "runtime"
	"strings"
	"testing"

	"aead.dev/minisign"
	"github.com/stormhop/kurlo/apps/desktop/internal/model"
)

func TestAppImageFromEnvironmentNeedsTheRunningBinaryInsideTheImage(t *testing.T) {
	dir := t.TempDir()
	appImage := filepath.Join(dir, "Kurlo.AppImage")
	if err := os.WriteFile(appImage, []byte("image"), 0755); err != nil {
		t.Fatal(err)
	}
	mount := filepath.Join(t.TempDir(), ".mount_KurloX1")
	inside := filepath.Join(mount, "usr", "bin", "kurlo")
	if got := appImageFromEnvironment(appImage, mount, inside); got != appImage {
		t.Fatalf("expected %q, got %q", appImage, got)
	}
	for name, c := range map[string][3]string{
		"no APPIMAGE":            {"", mount, inside},
		"no APPDIR":              {appImage, "", inside},
		"relative APPIMAGE":      {"Kurlo.AppImage", mount, inside},
		"binary outside the img": {appImage, mount, filepath.Join(dir, "bin", "kurlo")},
		"sibling mount":          {appImage, mount, filepath.Join(mount+"2", "usr", "bin", "kurlo")},
		"missing AppImage file":  {filepath.Join(dir, "gone.AppImage"), mount, inside},
	} {
		if got := appImageFromEnvironment(c[0], c[1], c[2]); got != "" {
			t.Fatalf("%s: expected no AppImage, got %q", name, got)
		}
	}
}

func TestUpdatePlatformKeysAskForTheAppImageInsideAnAppImage(t *testing.T) {
	if got := updatePlatformKeys("linux", "", "/home/u/Kurlo.AppImage", "linux-amd64"); strings.Join(got, ",") != "linux-amd64-appimage" {
		t.Fatalf("an AppImage must never take the bare binary, got %v", got)
	}
	if got := updatePlatformKeys("linux", "", "", "linux-amd64"); strings.Join(got, ",") != "linux-amd64" {
		t.Fatalf("a bare Linux binary keeps its key, got %v", got)
	}
}

func TestUpdateInfoFromManifestPicksTheAppImageAsset(t *testing.T) {
	manifest := &updateManifest{
		Version: "v9.9.9",
		Platforms: map[string]updatePlatform{
			"linux-amd64":          {URL: "https://github.com/stormhop/kurlo/releases/download/v9.9.9/kurlo-linux-amd64", SHA256: "aa"},
			"linux-amd64-appimage": {URL: "https://github.com/stormhop/kurlo/releases/download/v9.9.9/kurlo-9.9.9-linux-amd64.AppImage", SHA256: "bb", Signature: "https://github.com/stormhop/kurlo/releases/download/v9.9.9/kurlo-9.9.9-linux-amd64.AppImage.minisig"},
		},
	}
	info, err := updateInfoFromManifestFor(manifest, updatePlatformKeys("linux", "", "/home/u/Kurlo.AppImage", "linux-amd64"))
	if err != nil {
		t.Fatal(err)
	}
	if info.AssetName != "kurlo-9.9.9-linux-amd64.AppImage" || info.SHA256 != "bb" || !isAppImageAsset(info.AssetName) {
		t.Fatalf("expected the AppImage asset, got %+v", info)
	}

	delete(manifest.Platforms, "linux-amd64-appimage")
	if _, err := updateInfoFromManifestFor(manifest, updatePlatformKeys("linux", "", "/home/u/Kurlo.AppImage", "linux-amd64")); err == nil {
		t.Fatal("an AppImage must not fall back to the bare binary it cannot install")
	}
}

func TestApplyAppImageUpdateReplacesTheFileAndKeepsItExecutable(t *testing.T) {
	dir := t.TempDir()
	appImage := filepath.Join(dir, "Kurlo.AppImage")
	if err := os.WriteFile(appImage, []byte("old image"), 0750); err != nil {
		t.Fatal(err)
	}
	downloaded := filepath.Join(t.TempDir(), "download")
	if err := os.WriteFile(downloaded, []byte("new image"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := applyAppImageUpdate(downloaded, appImage); err != nil {
		t.Fatal(err)
	}
	got, err := os.ReadFile(appImage)
	if err != nil || string(got) != "new image" {
		t.Fatalf("expected the new image, got %q (%v)", got, err)
	}
	if goruntime.GOOS != "windows" {
		info, _ := os.Stat(appImage)
		if info.Mode().Perm()&0100 == 0 {
			t.Fatalf("expected the AppImage to stay executable, got %v", info.Mode())
		}
	}
	leftovers, _ := filepath.Glob(filepath.Join(dir, ".kurlo-update-*"))
	if len(leftovers) != 0 {
		t.Fatalf("expected no staged files left behind, got %v", leftovers)
	}
}

func TestApplyAppImageUpdateExplainsAReadOnlyFolder(t *testing.T) {
	if goruntime.GOOS == "windows" || os.Geteuid() == 0 {
		t.Skip("needs POSIX permissions enforced for this user")
	}
	dir := t.TempDir()
	appImage := filepath.Join(dir, "Kurlo.AppImage")
	if err := os.WriteFile(appImage, []byte("old image"), 0755); err != nil {
		t.Fatal(err)
	}
	downloaded := filepath.Join(t.TempDir(), "download")
	if err := os.WriteFile(downloaded, []byte("new image"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.Chmod(dir, 0555); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.Chmod(dir, 0755) })

	err := applyAppImageUpdate(downloaded, appImage)
	if !errors.Is(err, errUpdateAppImageNotWritable) {
		t.Fatalf("expected errUpdateAppImageNotWritable, got %v", err)
	}
	if got, _ := os.ReadFile(appImage); string(got) != "old image" {
		t.Fatalf("the old AppImage must survive a failed update, got %q", got)
	}
	if msg := friendlyUpdateError(err, "install the update"); !strings.Contains(msg, "AppImage") || strings.Contains(msg, "try again in a moment") {
		t.Fatalf("expected an AppImage-specific explanation, got %q", msg)
	}
}

func TestDownloadAndApplyInstallsASignedAppImage(t *testing.T) {
	if goruntime.GOOS != "linux" {
		t.Skip("AppImages only run on Linux")
	}
	allowAllTrustedURLsForTest(t)
	publicKey, privateKey, err := minisign.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	rawPublicKey, _ := publicKey.MarshalText()
	prevKey, prevVersion := updatePublicKey, appVersion
	updatePublicKey, appVersion = string(rawPublicKey), "1.0.0"
	t.Cleanup(func() { updatePublicKey, appVersion = prevKey, prevVersion })

	exe, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	appImage := filepath.Join(t.TempDir(), "Kurlo.AppImage")
	if err := os.WriteFile(appImage, []byte("version 1.0.0"), 0755); err != nil {
		t.Fatal(err)
	}
	t.Setenv("APPIMAGE", appImage)
	t.Setenv("APPDIR", filepath.Dir(exe))
	if runningAppImage() != appImage {
		t.Fatalf("expected the test to look like it runs from %s", appImage)
	}

	payload := []byte("version 2.0.0 AppImage")
	signature := signMessageHashed(t, privateKey, payload)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasSuffix(r.URL.Path, ".minisig") {
			_, _ = w.Write(signature)
			return
		}
		_, _ = w.Write(payload)
	}))
	defer server.Close()
	sum := sha256.Sum256(payload)

	err = downloadAndApply(context.Background(), &model.UpdateInfo{
		Version:      "2.0.0",
		DownloadURL:  server.URL + "/kurlo-2.0.0-linux-amd64.AppImage",
		AssetName:    "kurlo-2.0.0-linux-amd64.AppImage",
		SHA256:       hex.EncodeToString(sum[:]),
		SignatureURL: server.URL + "/kurlo-2.0.0-linux-amd64.AppImage.minisig",
	})
	if err != nil {
		t.Fatalf("expected the AppImage to update, got %v", err)
	}
	if got, _ := os.ReadFile(appImage); string(got) != string(payload) {
		t.Fatalf("expected the AppImage file itself to be replaced, got %q", got)
	}
}
