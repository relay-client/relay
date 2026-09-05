package api

import (
	"os"
	"time"
)

const (
	replaceFileRetryWindow   = 2 * time.Second
	replaceFileInitialBackof = 5 * time.Millisecond
	replaceFileMaxBackoff    = 100 * time.Millisecond
)

func replaceFile(tmpPath, path string) error {
	err := os.Rename(tmpPath, path)
	if err == nil || !renameRetryable(err) {
		return err
	}

	deadline := time.Now().Add(replaceFileRetryWindow)
	backoff := replaceFileInitialBackof
	for time.Now().Before(deadline) {
		time.Sleep(backoff)
		if backoff < replaceFileMaxBackoff {
			backoff *= 2
		}
		err = os.Rename(tmpPath, path)
		if err == nil || !renameRetryable(err) {
			return err
		}
	}
	return err
}
