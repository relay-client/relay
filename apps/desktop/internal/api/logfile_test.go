package api

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestRotatingLogWriterAppendsAcrossReopens(t *testing.T) {
	path := filepath.Join(t.TempDir(), "relay.log")

	first, err := newRotatingLogWriter(path, logMaxBytes)
	if err != nil {
		t.Fatalf("open log: %v", err)
	}
	if _, err := first.Write([]byte("one\n")); err != nil {
		t.Fatalf("write: %v", err)
	}
	if err := first.Close(); err != nil {
		t.Fatalf("close: %v", err)
	}

	second, err := newRotatingLogWriter(path, logMaxBytes)
	if err != nil {
		t.Fatalf("reopen log: %v", err)
	}
	t.Cleanup(func() { _ = second.Close() })
	if _, err := second.Write([]byte("two\n")); err != nil {
		t.Fatalf("write after reopen: %v", err)
	}

	body := readFileString(t, path)
	if body != "one\ntwo\n" {
		t.Fatalf("expected both runs in the log, got %q", body)
	}
}

func TestRotatingLogWriterKeepsOneGenerationAndStaysUnderTheCap(t *testing.T) {
	path := filepath.Join(t.TempDir(), "relay.log")
	writer, err := newRotatingLogWriter(path, 64)
	if err != nil {
		t.Fatalf("open log: %v", err)
	}
	t.Cleanup(func() { _ = writer.Close() })

	line := strings.Repeat("x", 20) + "\n"
	for i := 0; i < 12; i += 1 {
		if _, err := writer.Write([]byte(line)); err != nil {
			t.Fatalf("write %d: %v", i, err)
		}
	}

	info, err := os.Stat(path)
	if err != nil {
		t.Fatalf("stat current log: %v", err)
	}
	if info.Size() > 64 {
		t.Fatalf("current log grew past the cap: %d bytes", info.Size())
	}
	rotated, err := os.Stat(path + logRotatedSuffix)
	if err != nil {
		t.Fatalf("expected a rotated log: %v", err)
	}
	if rotated.Size() == 0 {
		t.Fatal("the rotated log should hold what was written before the roll")
	}

	entries, err := os.ReadDir(filepath.Dir(path))
	if err != nil {
		t.Fatalf("read log dir: %v", err)
	}
	if len(entries) != 2 {
		names := make([]string, 0, len(entries))
		for _, entry := range entries {
			names = append(names, entry.Name())
		}
		t.Fatalf("expected the current and one previous log, got %v", names)
	}
}

func TestRotatingLogWriterNeverSplitsAnEntry(t *testing.T) {
	path := filepath.Join(t.TempDir(), "relay.log")
	writer, err := newRotatingLogWriter(path, 32)
	if err != nil {
		t.Fatalf("open log: %v", err)
	}
	t.Cleanup(func() { _ = writer.Close() })

	if _, err := writer.Write([]byte("first entry\n")); err != nil {
		t.Fatalf("write: %v", err)
	}
	whole := "an entry longer than the cap allows\n"
	if _, err := writer.Write([]byte(whole)); err != nil {
		t.Fatalf("write long entry: %v", err)
	}

	if body := readFileString(t, path); body != whole {
		t.Fatalf("expected the whole entry in the fresh log, got %q", body)
	}
	if rotated := readFileString(t, path+logRotatedSuffix); rotated != "first entry\n" {
		t.Fatalf("expected the earlier entry in the rotated log, got %q", rotated)
	}
}

func TestLogFilePathLivesUnderRelayAppData(t *testing.T) {
	path := LogFilePath()

	if filepath.Base(path) != logFileName {
		t.Fatalf("unexpected log file name in %q", path)
	}
	if filepath.Dir(path) != logDir() {
		t.Fatalf("expected the log inside %q, got %q", logDir(), path)
	}
}

func readFileString(t *testing.T, path string) string {
	t.Helper()
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read %s: %v", path, err)
	}
	return string(data)
}
