package api

import (
	"os"
	"time"
)

// Every durable write in Relay ends the same way: content goes to a temporary
// file next to the target, is fsynced, and is then renamed over it. The rename
// is what makes the write atomic — a reader sees either the old file or the new
// one, never a half-written one.
//
// On Unix that rename always succeeds. Windows refuses it while any other
// handle has the destination open, and it is routinely held for a moment by
// something outside Relay: an antivirus scanner, a backup agent, the search
// indexer, or a sync client. The failure surfaces as "Access is denied", and a
// save that hit that instant simply failed — the very case the atomic write
// exists to protect against.
//
// Retrying over a short window turns a transient holder into a slightly slower
// save. A destination genuinely locked for longer than this still reports the
// error rather than hanging.

const (
	replaceFileRetryWindow   = 2 * time.Second
	replaceFileInitialBackof = 5 * time.Millisecond
	replaceFileMaxBackoff    = 100 * time.Millisecond
)

// replaceFile renames tmpPath onto path, retrying while the destination is
// transiently locked. Callers keep whatever cleanup they already do for the
// temporary file: on a returned error, tmpPath is left where it was.
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
