//go:build windows

package api

import (
	"errors"
	"syscall"
)

// The two ways Windows reports "someone else still has this file open".
// ERROR_ACCESS_DENIED also covers permanent permission problems, which is why
// the retry is bounded rather than indefinite.
const (
	errorAccessDenied     = syscall.Errno(5)
	errorSharingViolation = syscall.Errno(32)
	errorLockViolation    = syscall.Errno(33)
)

func renameRetryable(err error) bool {
	if err == nil {
		return false
	}
	var errno syscall.Errno
	if !errors.As(err, &errno) {
		return false
	}
	switch errno {
	case errorAccessDenied, errorSharingViolation, errorLockViolation:
		return true
	default:
		return false
	}
}
