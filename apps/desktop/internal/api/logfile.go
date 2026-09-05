package api

import (
	"io"
	"log"
	"os"
	"path/filepath"
	"sync"
)

const (
	logFileName      = "relay.log"
	logMaxBytes      = 1 << 20
	logRotatedSuffix = ".1"
)

func logDir() string {
	return filepath.Join(requestStoreDir(), "logs")
}

func LogFilePath() string {
	return filepath.Join(logDir(), logFileName)
}

type rotatingLogWriter struct {
	mu       sync.Mutex
	path     string
	maxBytes int64
	file     *os.File
	size     int64
}

func newRotatingLogWriter(path string, maxBytes int64) (*rotatingLogWriter, error) {
	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		return nil, err
	}
	w := &rotatingLogWriter{path: path, maxBytes: maxBytes}
	if err := w.open(); err != nil {
		return nil, err
	}
	return w, nil
}

func (w *rotatingLogWriter) open() error {
	file, err := os.OpenFile(w.path, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0600)
	if err != nil {
		return err
	}
	size := int64(0)
	if info, statErr := file.Stat(); statErr == nil {
		size = info.Size()
	}
	w.file = file
	w.size = size
	return nil
}

func (w *rotatingLogWriter) rotate() error {
	if w.file != nil {
		_ = w.file.Close()
		w.file = nil
	}
	_ = os.Remove(w.path + logRotatedSuffix)
	_ = os.Rename(w.path, w.path+logRotatedSuffix)
	return w.open()
}

func (w *rotatingLogWriter) Write(p []byte) (int, error) {
	w.mu.Lock()
	defer w.mu.Unlock()
	if w.file == nil {
		if err := w.open(); err != nil {
			return 0, err
		}
	}
	if w.size > 0 && w.size+int64(len(p)) > w.maxBytes {
		if err := w.rotate(); err != nil {
			return 0, err
		}
	}
	n, err := w.file.Write(p)
	w.size += int64(n)
	return n, err
}

func (w *rotatingLogWriter) Close() error {
	w.mu.Lock()
	defer w.mu.Unlock()
	if w.file == nil {
		return nil
	}
	err := w.file.Close()
	w.file = nil
	return err
}

var (
	activeLogWriter   *rotatingLogWriter
	activeLogWriterMu sync.Mutex
)

func InstallLogFile() (string, error) {
	path := LogFilePath()
	writer, err := newRotatingLogWriter(path, logMaxBytes)
	if err != nil {
		return path, err
	}

	activeLogWriterMu.Lock()
	previous := activeLogWriter
	activeLogWriter = writer
	activeLogWriterMu.Unlock()
	if previous != nil {
		_ = previous.Close()
	}

	log.SetFlags(log.LstdFlags | log.Lmsgprefix)
	log.SetOutput(io.MultiWriter(os.Stderr, writer))
	log.Printf("relay: %s starting", VersionLine())
	return path, nil
}

func CloseLogFile() {
	activeLogWriterMu.Lock()
	writer := activeLogWriter
	activeLogWriter = nil
	activeLogWriterMu.Unlock()
	if writer == nil {
		return
	}
	log.SetOutput(os.Stderr)
	_ = writer.Close()
}
