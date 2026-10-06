package api

import (
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	goruntime "runtime"
	"strings"
)

const appImageManifestSuffix = "-appimage"

var errUpdateAppImageNotWritable = errors.New("the AppImage cannot be replaced")

func runningAppImage() string {
	if goruntime.GOOS != "linux" {
		return ""
	}
	exe, err := os.Executable()
	if err != nil {
		return ""
	}
	return appImageFromEnvironment(os.Getenv("APPIMAGE"), os.Getenv("APPDIR"), exe)
}

func appImageFromEnvironment(appImage, appDir, exe string) string {
	if appImage == "" || appDir == "" || !filepath.IsAbs(appImage) || !filepath.IsAbs(appDir) {
		return ""
	}
	rel, err := filepath.Rel(appDir, exe)
	if err != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
		return ""
	}
	if !regularFileExists(appImage) {
		return ""
	}
	return appImage
}

func appImageManifestKey(platform string) string {
	return platform + appImageManifestSuffix
}

func isAppImageAsset(assetName string) bool {
	return strings.HasSuffix(strings.ToLower(strings.TrimSpace(assetName)), ".appimage")
}

func applyAppImageUpdate(downloadedPath, appImagePath string) error {
	if appImagePath == "" {
		return errUpdateAppImageNotWritable
	}
	mode := os.FileMode(0755)
	if info, err := os.Stat(appImagePath); err == nil {
		mode = info.Mode().Perm() | 0111
	}
	src, err := os.Open(downloadedPath)
	if err != nil {
		return err
	}
	defer src.Close()
	staged, err := os.CreateTemp(filepath.Dir(appImagePath), ".kurlo-update-*.AppImage")
	if err != nil {
		return fmt.Errorf("%w: %v", errUpdateAppImageNotWritable, err)
	}
	stagedPath := staged.Name()
	committed := false
	defer func() {
		if !committed {
			_ = os.Remove(stagedPath)
		}
	}()
	if _, err := io.Copy(staged, src); err != nil {
		staged.Close()
		return err
	}
	if err := staged.Sync(); err != nil {
		staged.Close()
		return err
	}
	if err := staged.Close(); err != nil {
		return err
	}
	if err := os.Chmod(stagedPath, mode); err != nil {
		return err
	}
	if err := os.Rename(stagedPath, appImagePath); err != nil {
		return fmt.Errorf("%w: %v", errUpdateAppImageNotWritable, err)
	}
	committed = true
	return nil
}
