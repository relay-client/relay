package api

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestMain(m *testing.M) {
	if err := os.Setenv(requestStoreDisableKeychain, "1"); err != nil {
		panic(err)
	}
	os.Exit(m.Run())
}

// requireSymlinks skips a test on a machine that cannot create symbolic links.
// Windows only allows them with Developer Mode or elevation, and a test that
// exists to check Relay refuses to follow one has nothing to say there. This
// probes rather than checking GOOS, so the test still runs on a Windows
// machine where symlinks do work.
func requireSymlinks(t *testing.T) {
	t.Helper()
	dir := t.TempDir()
	target := filepath.Join(dir, "target")
	if err := os.WriteFile(target, []byte("probe"), 0644); err != nil {
		t.Fatalf("write symlink probe target: %v", err)
	}
	if err := os.Symlink(target, filepath.Join(dir, "link")); err != nil {
		t.Skipf("symlinks are not available on this machine: %v", err)
	}
}

// useTempConfigDir points requestStoreDir() at a temporary directory, so a
// test never touches the real Relay profile.
//
// os.UserConfigDir reads a different variable on each platform, and setting
// only the Unix ones left every Windows run writing into the machine's actual
// %AppData%\Relay — where tests collided with each other (a store written
// under one key and read under another, surfacing as "cipher: message
// authentication failed") and would have overwritten a developer's real
// workspace.
func useTempConfigDir(t *testing.T, dir string) {
	t.Helper()
	t.Setenv("XDG_CONFIG_HOME", dir) // Linux
	t.Setenv("APPDATA", dir)         // Windows
	t.Setenv("LOCALAPPDATA", dir)    // Windows, for anything reading the local variant
	t.Setenv("HOME", dir)            // macOS derives the config dir from HOME
	t.Setenv("USERPROFILE", dir)     // keep os.UserHomeDir() inside the sandbox too
}

// useTempHomeDir points os.UserHomeDir() somewhere other than the config
// directory — it is what the default "Documents/Relay" workspace location is
// built from. Call it after useTempConfigDir.
//
// On macOS the config directory is derived from HOME, so the two cannot
// actually be separated there and the config follows home; the tests using
// this only assert the home-derived path, which holds either way.
func useTempHomeDir(t *testing.T, dir string) {
	t.Helper()
	t.Setenv("HOME", dir)
	t.Setenv("USERPROFILE", dir)
}

// normalizeNewlines makes a comparison independent of the line endings Git
// chose on checkout — core.autocrlf is on by default in Git for Windows, so a
// file committed with LF comes back with CRLF there.
func normalizeNewlines(value string) string {
	return strings.ReplaceAll(value, "\r\n", "\n")
}
