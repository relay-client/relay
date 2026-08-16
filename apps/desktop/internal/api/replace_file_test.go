package api

import (
	"errors"
	"os"
	"path/filepath"
	"runtime"
	"syscall"
	"testing"
)

func TestReplaceFileSwapsTheDestination(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "store.yml")
	tmpPath := filepath.Join(dir, ".store.tmp")
	if err := os.WriteFile(path, []byte("old"), 0644); err != nil {
		t.Fatalf("write destination: %v", err)
	}
	if err := os.WriteFile(tmpPath, []byte("new"), 0644); err != nil {
		t.Fatalf("write temporary: %v", err)
	}

	if err := replaceFile(tmpPath, path); err != nil {
		t.Fatalf("replaceFile: %v", err)
	}

	if got := readFileString(t, path); got != "new" {
		t.Fatalf("destination holds %q, want the new content", got)
	}
	if _, err := os.Stat(tmpPath); !os.IsNotExist(err) {
		t.Fatalf("the temporary file should be gone, stat err = %v", err)
	}
}

func TestReplaceFileReportsARealFailure(t *testing.T) {
	// A missing source is not a transient lock, so it must come back at once
	// rather than after the retry window.
	dir := t.TempDir()
	err := replaceFile(filepath.Join(dir, "absent.tmp"), filepath.Join(dir, "store.yml"))
	if err == nil {
		t.Fatal("expected an error when the temporary file does not exist")
	}
	if renameRetryable(err) {
		t.Fatalf("a missing source must not be treated as retryable: %v", err)
	}
}

// renameRetryable is what decides whether a failed rename is worth another
// attempt. On Unix nothing is: the entry is replaced whether or not another
// process holds the destination open, so a failure there is real.
func TestRenameRetryableClassification(t *testing.T) {
	if renameRetryable(nil) {
		t.Fatal("no error is not retryable")
	}
	if renameRetryable(errors.New("some other failure")) {
		t.Fatal("an unrecognised error must not be retried")
	}
	if renameRetryable(os.ErrNotExist) {
		t.Fatal("a missing file must not be retried")
	}

	// ERROR_SHARING_VIOLATION: another handle has the destination open. This
	// is the case Windows reports where Unix simply succeeds — a scanner, a
	// backup agent or an indexer holding the file for a moment.
	sharingViolation := &os.LinkError{
		Op:  "rename",
		Old: "a.tmp",
		New: "a.yml",
		Err: syscall.Errno(32),
	}
	if got, want := renameRetryable(sharingViolation), runtime.GOOS == "windows"; got != want {
		t.Fatalf("sharing violation retryable = %v, want %v on this platform", got, want)
	}
}
