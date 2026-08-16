//go:build !windows

package api

// Unix replaces the directory entry whether or not another process holds the
// destination open, so a failed rename here is a real failure.
func renameRetryable(error) bool { return false }
