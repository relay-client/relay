package api

import (
	"errors"
	"os"
	"path/filepath"
	goruntime "runtime"
	"strings"
	"testing"
)

func TestOpenLogFolderHandsTheLogDirToTheFileManager(t *testing.T) {
	t.Setenv("HOME", t.TempDir())
	t.Setenv("XDG_CONFIG_HOME", filepath.Join(t.TempDir(), "config"))

	var revealed string
	restore := stubReveal(t, func(dir string) error {
		revealed = dir
		return nil
	})
	defer restore()

	app := &App{}
	if msg := app.OpenLogFolder(); msg != "" {
		t.Fatalf("expected no error message, got %q", msg)
	}
	if revealed != logDir() {
		t.Fatalf("expected the log dir %q to be revealed, got %q", logDir(), revealed)
	}
	if info, err := os.Stat(revealed); err != nil || !info.IsDir() {
		t.Fatalf("expected the log dir to exist: %v", err)
	}
}

func TestOpenLogFolderReportsAFailedReveal(t *testing.T) {
	t.Setenv("HOME", t.TempDir())
	t.Setenv("XDG_CONFIG_HOME", filepath.Join(t.TempDir(), "config"))

	restore := stubReveal(t, func(string) error { return errors.New("no file manager") })
	defer restore()

	msg := (&App{}).OpenLogFolder()
	if !strings.Contains(msg, "no file manager") {
		t.Fatalf("expected the failure to reach the UI, got %q", msg)
	}
}

func TestFileManagerCommandUsesTheNativeOpener(t *testing.T) {
	dir := filepath.Join(t.TempDir(), "Application Support", "Relay", "logs")
	cmd := fileManagerCommand(dir)

	want := map[string]string{"darwin": "open", "windows": "explorer"}[goruntime.GOOS]
	if want == "" {
		want = "xdg-open"
	}
	if filepath.Base(cmd.Path) != want && cmd.Args[0] != want {
		t.Fatalf("expected %q to open the folder, got %v", want, cmd.Args)
	}
	if len(cmd.Args) != 2 {
		t.Fatalf("expected the directory as the only argument, got %v", cmd.Args)
	}
	if cmd.Args[1] != filepath.FromSlash(dir) {
		t.Fatalf("expected the path passed through untouched, got %q", cmd.Args[1])
	}
}

func stubReveal(t *testing.T, fn func(string) error) func() {
	t.Helper()
	previous := revealInFileManager
	revealInFileManager = fn
	return func() { revealInFileManager = previous }
}
