package api

import (
	"errors"
	"fmt"
	"os"
	goruntime "runtime"
	"strings"
	"sync"

	"github.com/stormhop/kurlo/apps/desktop/internal/model"
)

const (
	packageStatusSuccess            = 0
	packageStatusInsufficientBuffer = 122
)

var errUpdateManagedByPackage = errors.New("kurlo runs from a windows app package that cannot be replaced in place")

var (
	packagedInstallOverride func() bool
	detectedPackagedInstall = sync.OnceValue(detectPackagedInstall)
)

func runningAsPackagedApp() bool {
	if packagedInstallOverride != nil {
		return packagedInstallOverride()
	}
	return detectedPackagedInstall()
}

func detectPackagedInstall() bool {
	if goruntime.GOOS != "windows" {
		return false
	}
	exe, err := os.Executable()
	if err != nil {
		exe = ""
	}
	return isPackagedInstall(hasPackageIdentity(), exe)
}

func isPackagedInstall(hasIdentity bool, exe string) bool {
	return hasIdentity || isWindowsAppsPath(exe)
}

func packageIdentityFromStatus(status uintptr) bool {
	return status == packageStatusSuccess || status == packageStatusInsufficientBuffer
}

func isWindowsAppsPath(exe string) bool {
	normalized := strings.ToLower(strings.ReplaceAll(exe, "/", `\`))
	return strings.Contains(normalized, `\windowsapps\`)
}

func msixPackageURL(version, arch string) string {
	version = strings.TrimPrefix(strings.TrimSpace(version), "v")
	return fmt.Sprintf("https://github.com/%s/releases/download/v%s/kurlo-%s-windows-%s.msix", strings.Trim(githubRepo, "/"), version, version, arch)
}

func withPackagedInstall(info *model.UpdateInfo, packaged bool, arch string) *model.UpdateInfo {
	if info == nil || !packaged {
		return info
	}
	info.ManualInstallURL = msixPackageURL(info.Version, arch)
	return info
}
