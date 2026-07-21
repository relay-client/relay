package api

import "testing"

func TestInitialWindowBackgroundUsesSavedThemeVariantColor(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("HOME", dir)
	t.Setenv("XDG_CONFIG_HOME", dir)

	if err := saveResolvedThemePreference("dark"); err != nil {
		t.Fatalf("save resolved theme: %v", err)
	}
	if err := saveWindowBackgroundPreference("#303446"); err != nil {
		t.Fatalf("save background: %v", err)
	}

	r, g, b, a := InitialWindowBackgroundRGBA()
	if r != 0x30 || g != 0x34 || b != 0x46 || a != 0xff {
		t.Fatalf("background = rgba(%d,%d,%d,%d), want rgba(48,52,70,255)", r, g, b, a)
	}
	if got := InitialWindowResolvedTheme(); got != "dark" {
		t.Fatalf("resolved theme = %q, want dark", got)
	}
}

func TestInitialWindowBackgroundFallsBackToResolvedTheme(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("HOME", dir)
	t.Setenv("XDG_CONFIG_HOME", dir)

	if err := saveResolvedThemePreference("light"); err != nil {
		t.Fatalf("save resolved theme: %v", err)
	}
	if err := saveWindowBackgroundPreference("not-a-color"); err != nil {
		t.Fatalf("clear invalid background: %v", err)
	}

	r, g, b, a := InitialWindowBackgroundRGBA()
	if r != 246 || g != 248 || b != 252 || a != 255 {
		t.Fatalf("background = rgba(%d,%d,%d,%d), want light fallback", r, g, b, a)
	}
}
