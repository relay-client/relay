package api

import (
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

const (
	resolvedThemeDark  = "dark"
	resolvedThemeLight = "light"
)

func themePreferencePath() string {
	return filepath.Join(requestStoreDir(), "theme.txt")
}

func themeBackgroundPreferencePath() string {
	return filepath.Join(requestStoreDir(), "theme-background.txt")
}

func normalizeResolvedTheme(theme string) string {
	if strings.TrimSpace(theme) == resolvedThemeLight {
		return resolvedThemeLight
	}
	return resolvedThemeDark
}

func windowBackgroundForTheme(theme string) (uint8, uint8, uint8, uint8) {
	if normalizeResolvedTheme(theme) == resolvedThemeLight {
		return 246, 248, 252, 255
	}
	return 15, 15, 26, 255
}

func parseHexWindowBackground(value string) (uint8, uint8, uint8, bool) {
	hex := strings.TrimSpace(value)
	hex = strings.TrimPrefix(hex, "#")
	if len(hex) != 6 {
		return 0, 0, 0, false
	}
	parsed, err := strconv.ParseUint(hex, 16, 32)
	if err != nil {
		return 0, 0, 0, false
	}
	return uint8(parsed >> 16), uint8(parsed >> 8), uint8(parsed), true
}

func loadResolvedThemePreference() string {
	data, err := os.ReadFile(themePreferencePath())
	if err != nil {
		return resolvedThemeDark
	}
	return normalizeResolvedTheme(string(data))
}

func saveResolvedThemePreference(theme string) error {
	if err := os.MkdirAll(requestStoreDir(), 0700); err != nil {
		return err
	}
	return os.WriteFile(themePreferencePath(), []byte(normalizeResolvedTheme(theme)), 0600)
}

func loadWindowBackgroundPreference(theme string) (uint8, uint8, uint8, uint8) {
	data, err := os.ReadFile(themeBackgroundPreferencePath())
	if err == nil {
		if r, g, b, ok := parseHexWindowBackground(string(data)); ok {
			return r, g, b, 255
		}
	}
	return windowBackgroundForTheme(theme)
}

func saveWindowBackgroundPreference(background string) error {
	r, g, b, ok := parseHexWindowBackground(background)
	if !ok {
		if err := os.Remove(themeBackgroundPreferencePath()); err != nil && !os.IsNotExist(err) {
			return err
		}
		return nil
	}
	if err := os.MkdirAll(requestStoreDir(), 0700); err != nil {
		return err
	}
	return os.WriteFile(themeBackgroundPreferencePath(), []byte("#"+hexByte(r)+hexByte(g)+hexByte(b)), 0600)
}

func hexByte(value uint8) string {
	const digits = "0123456789abcdef"
	return string([]byte{digits[value>>4], digits[value&0x0f]})
}

func InitialWindowBackgroundRGBA() (uint8, uint8, uint8, uint8) {
	theme := loadResolvedThemePreference()
	return loadWindowBackgroundPreference(theme)
}

func InitialWindowResolvedTheme() string {
	return loadResolvedThemePreference()
}
