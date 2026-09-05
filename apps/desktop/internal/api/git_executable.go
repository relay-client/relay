package api

import (
	"errors"
	"os/exec"
	"runtime"
	"strings"
	"sync/atomic"
)

const gitNotInstalledMessage = "Git is not installed, or Relay cannot find it on PATH.\n\nInstall Git from https://git-scm.com/downloads, then restart Relay. Until then, a workspace can still be used in local (non-Git) mode."

const gitDeveloperToolsMessage = "Git cannot run on this Mac: the Xcode Command Line Tools it depends on are not installed.\n\nRun 'xcode-select --install' in Terminal, then restart Relay. Until then, a workspace can still be used in local (non-Git) mode."

type gitUnavailableError struct{ message string }

func (e *gitUnavailableError) Error() string { return e.message }

var gitExecutableCache atomic.Pointer[string]

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
	var execErr *exec.Error
	if errors.As(err, &execErr) && errors.Is(execErr.Err, exec.ErrNotFound) {
		return gitNotInstalledMessage
	}
	return ""
}
