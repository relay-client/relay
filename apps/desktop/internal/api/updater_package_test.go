package api

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	goruntime "runtime"
	"strings"
	"sync/atomic"
	"testing"

	"github.com/stormhop/kurlo/apps/desktop/internal/model"
)

func setPackagedInstallForTest(t *testing.T, packaged bool) {
	t.Helper()
	prev := packagedInstallOverride
	packagedInstallOverride = func() bool { return packaged }
	t.Cleanup(func() { packagedInstallOverride = prev })
}

func TestIsWindowsAppsPath(t *testing.T) {
	tests := []struct {
		exe  string
		want bool
	}{
		{exe: `C:\Program Files\WindowsApps\dev.kurlo.app_2.0.2.0_x64__abc123\kurlo.exe`, want: true},
		{exe: `c:\program files\windowsapps\dev.kurlo.app_2.0.2.0_arm64__abc123\kurlo.exe`, want: true},
		{exe: `D:/WindowsApps/dev.kurlo.app_2.0.2.0_x64__abc123/kurlo.exe`, want: true},
		{exe: `C:\Users\dev\AppData\Local\Programs\Kurlo\kurlo.exe`, want: false},
		{exe: `C:\Program Files\Kurlo\kurlo.exe`, want: false},
		{exe: `C:\Users\dev\MyWindowsApps\kurlo.exe`, want: false},
		{exe: "", want: false},
	}
	for _, tt := range tests {
		if got := isWindowsAppsPath(tt.exe); got != tt.want {
			t.Errorf("isWindowsAppsPath(%q) = %v, want %v", tt.exe, got, tt.want)
		}
	}
}

func TestIsPackagedInstallTrustsEitherSignal(t *testing.T) {
	installed := `C:\Users\dev\AppData\Local\Programs\Kurlo\kurlo.exe`
	packaged := `C:\Program Files\WindowsApps\dev.kurlo.app_2.0.2.0_x64__abc123\kurlo.exe`
	if isPackagedInstall(false, installed) {
		t.Fatal("a plain install without package identity must self-update")
	}
	if !isPackagedInstall(true, installed) {
		t.Fatal("package identity must mark the install as packaged")
	}
	if !isPackagedInstall(false, packaged) {
		t.Fatal("an executable under WindowsApps must be treated as packaged")
	}
}

func TestPackageIdentityFromStatus(t *testing.T) {
	tests := []struct {
		status uintptr
		want   bool
	}{
		{status: 0, want: true},
		{status: 122, want: true},
		{status: 15700, want: false},
		{status: 87, want: false},
	}
	for _, tt := range tests {
		if got := packageIdentityFromStatus(tt.status); got != tt.want {
			t.Errorf("packageIdentityFromStatus(%d) = %v, want %v", tt.status, got, tt.want)
		}
	}
}

func TestPackagedInstallIsNeverDetectedOffWindows(t *testing.T) {
	if goruntime.GOOS == "windows" {
		t.Skip("detection depends on how the test binary was launched")
	}
	if detectPackagedInstall() {
		t.Fatal("packaged installs exist only on Windows")
	}
}

func TestMSIXPackageURLPointsAtTheVersionsReleaseAsset(t *testing.T) {
	originalRepo := githubRepo
	t.Cleanup(func() { githubRepo = originalRepo })
	githubRepo = "owner/project"

	for _, version := range []string{"2.1.0", "v2.1.0", " 2.1.0 "} {
		got := msixPackageURL(version, "arm64")
		want := "https://github.com/owner/project/releases/download/v2.1.0/kurlo-2.1.0-windows-arm64.msix"
		if got != want {
			t.Fatalf("msixPackageURL(%q) = %q, want %q", version, got, want)
		}
	}
}

func TestMSIXPackageURLMatchesTheReleaseWorkflowAssetName(t *testing.T) {
	root := repoRootForTest(t)
	workflow, err := os.ReadFile(filepath.Join(root, ".github", "workflows", "release.yml"))
	if err != nil {
		t.Skipf("release workflow unavailable: %v", err)
	}
	asset := `"release\kurlo-$env:VERSION-windows-${{ matrix.arch }}.msix"`
	if !strings.Contains(string(workflow), asset) {
		t.Fatalf("release workflow no longer publishes %s; update msixPackageURL to match", asset)
	}
	for _, arch := range []string{"amd64", "arm64"} {
		if !strings.Contains(string(workflow), "arch: "+arch) {
			t.Fatalf("release workflow has no MSIX build for %s", arch)
		}
		if got := msixPackageURL("1.2.3", arch); !strings.HasSuffix(got, "/v1.2.3/kurlo-1.2.3-windows-"+arch+".msix") {
			t.Fatalf("unexpected MSIX url for %s: %q", arch, got)
		}
	}
}

func packagedTestManifest() *updateManifest {
	return &updateManifest{
		Version: "v2.1.0",
		Platforms: map[string]updatePlatform{
			platformKey(): {
				URL:    "https://github.com/stormhop/kurlo/releases/download/v2.1.0/kurlo-binary",
				SHA256: "abc123",
			},
		},
	}
}

func TestUpdateInfoFromManifestSendsPackagedInstallsToTheMSIX(t *testing.T) {
	setPackagedInstallForTest(t, true)

	info, err := updateInfoFromManifest(packagedTestManifest())
	if err != nil {
		t.Fatalf("updateInfoFromManifest failed: %v", err)
	}
	if want := msixPackageURL("2.1.0", goruntime.GOARCH); info.ManualInstallURL != want {
		t.Fatalf("expected manual install url %q, got %q", want, info.ManualInstallURL)
	}
	if info.Version != "2.1.0" || info.SHA256 != "abc123" {
		t.Fatalf("packaged installs must still report the release: %+v", info)
	}
}

func TestUpdateInfoFromManifestKeepsSelfUpdateForPlainInstalls(t *testing.T) {
	setPackagedInstallForTest(t, false)

	info, err := updateInfoFromManifest(packagedTestManifest())
	if err != nil {
		t.Fatalf("updateInfoFromManifest failed: %v", err)
	}
	if info.ManualInstallURL != "" {
		t.Fatalf("plain installs must self-update, got manual url %q", info.ManualInstallURL)
	}
}

func TestWithPackagedInstallToleratesMissingInfo(t *testing.T) {
	if got := withPackagedInstall(nil, true, "amd64"); got != nil {
		t.Fatalf("expected nil, got %+v", got)
	}
}

func TestDownloadAndApplyRefusesPackagedInstallsBeforeDownloading(t *testing.T) {
	setPackagedInstallForTest(t, true)
	allowAllTrustedURLsForTest(t)
	var hits atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits.Add(1)
		fmt.Fprint(w, "binary")
	}))
	defer server.Close()

	err := downloadAndApply(context.Background(), &model.UpdateInfo{
		Version:     "999.0.0",
		DownloadURL: server.URL + "/kurlo-windows-amd64.exe",
		AssetName:   "kurlo-windows-amd64.exe",
		SHA256:      "abc123",
	})
	if !errors.Is(err, errUpdateManagedByPackage) {
		t.Fatalf("expected errUpdateManagedByPackage, got %v", err)
	}
	if n := hits.Load(); n != 0 {
		t.Fatalf("expected no download for a packaged install, got %d requests", n)
	}
}

func TestApplyUpdateExplainsPackagedInstalls(t *testing.T) {
	setPackagedInstallForTest(t, true)
	originalVersion := appVersion
	t.Cleanup(func() { appVersion = originalVersion })
	appVersion = "2.0.2"

	got := (&App{}).ApplyUpdate(model.UpdateInfo{Version: "2.1.0"})
	if !strings.Contains(got, "Windows app package") {
		t.Fatalf("expected the packaged install explanation, got %q", got)
	}
	if strings.Contains(strings.ToLower(got), "permission") {
		t.Fatalf("packaged installs must not report a permission failure, got %q", got)
	}
}

func TestFriendlyUpdateErrorForPackagedInstalls(t *testing.T) {
	got := friendlyUpdateError(fmt.Errorf("apply: %w", errUpdateManagedByPackage), "install the update")
	if !strings.HasPrefix(got, "Could not install the update.") || !strings.Contains(got, "Download the new package") {
		t.Fatalf("unexpected message %q", got)
	}
}

func TestAppInfoReportsPackagedInstalls(t *testing.T) {
	setPackagedInstallForTest(t, true)
	if !(&App{}).AppInfo().Packaged {
		t.Fatal("expected AppInfo to report the packaged install")
	}
	setPackagedInstallForTest(t, false)
	if (&App{}).AppInfo().Packaged {
		t.Fatal("expected AppInfo to report a plain install")
	}
}
