package api

import (
	"os"
	"path/filepath"
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
