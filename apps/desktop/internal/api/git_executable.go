package api

import (
	"errors"
	"os/exec"
	"runtime"
	"strings"
	"sync/atomic"
)

// Relay drives Git by shelling out, so every Git-backed workspace depends on a
// `git` the operating system can actually run. Two ways that fails are common
// enough to deserve their own message rather than a raw exec error: Git is not
// installed at all (a stock Windows machine has none), and macOS answers
// `/usr/bin/git` with a stub that only works once the Command Line Tools are
// present — there LookPath succeeds and the failure arrives from xcrun.

const gitNotInstalledMessage = "Git is not installed, or Relay cannot find it on PATH.\n\nInstall Git from https://git-scm.com/downloads, then restart Relay. Until then, a workspace can still be used in local (non-Git) mode."

const gitDeveloperToolsMessage = "Git cannot run on this Mac: the Xcode Command Line Tools it depends on are not installed.\n\nRun 'xcode-select --install' in Terminal, then restart Relay. Until then, a workspace can still be used in local (non-Git) mode."

// gitUnavailableError marks the case where no git binary could be found, so
// callers can tell it apart from a git command that ran and reported a
// problem.
type gitUnavailableError struct{ message string }

func (e *gitUnavailableError) Error() string { return e.message }

// gitExecutableCache holds the resolved path once a lookup succeeds. Only
// success is cached: a failed lookup is retried, so installing Git while Relay
// is open starts working without a restart.
var gitExecutableCache atomic.Pointer[string]

// lookupGitExecutable is a variable so a test can stand in for a machine with
// no Git installed, which is otherwise not reproducible from inside a test
// that needs a working Git for everything else.
var lookupGitExecutable = func() (string, error) {
	if cached := gitExecutableCache.Load(); cached != nil {
		return *cached, nil
	}
	path, err := exec.LookPath("git")
	if err != nil {
		return "", &gitUnavailableError{message: gitNotInstalledMessage}
	}
	gitExecutableCache.Store(&path)
	return path, nil
}

// gitDeveloperToolsMissing recognises the macOS stub's complaint. The wording
// has varied across releases, so each known form is matched independently.
func gitDeveloperToolsMissing(output string) bool {
	if runtime.GOOS != "darwin" {
		return false
	}
	lower := strings.ToLower(output)
	return strings.Contains(lower, "invalid active developer path") ||
		strings.Contains(lower, "command line developer tools") ||
		strings.Contains(lower, "no developer tools were found") ||
		strings.Contains(lower, "xcode-select: error")
}

// gitUnavailableMessage returns the message to show when a git invocation
// failed because git itself is unusable, or "" when the failure came from Git
// having actually run.
func gitUnavailableMessage(output string, err error) string {
	if err == nil {
		return ""
	}
	var unavailable *gitUnavailableError
	if errors.As(err, &unavailable) {
		return unavailable.message
	}
	if gitDeveloperToolsMissing(output) {
		return gitDeveloperToolsMessage
	}
	// exec.Error survives from a command that was built before this package
	// resolved the path, and from any other exec path that looks git up.
	var execErr *exec.Error
	if errors.As(err, &execErr) && errors.Is(execErr.Err, exec.ErrNotFound) {
		return gitNotInstalledMessage
	}
	return ""
}
