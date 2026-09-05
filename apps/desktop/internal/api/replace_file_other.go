//go:build !windows

package api

func renameRetryable(error) bool { return false }
