package api

import (
	"fmt"
	"os"
	"os/exec"
	"runtime"
	"strings"
)

// A bug report that says "it does not work" costs a round trip to answer.
// These two are what closes that gap: a one-line version for `relay --version`
// and the release smoke test, and a fuller report the app can put on the
// clipboard. Both are built from the same facts so they cannot disagree, and
// both are deliberately free of anything from the user's workspace — no paths
// to their collections, no URLs, no credentials.

// VersionLine is what `relay --version` prints.
func VersionLine() string {
	return fmt.Sprintf("Relay %s (%s/%s)", displayVersion(), runtime.GOOS, runtime.GOARCH)
}

func displayVersion() string {
	if version := strings.TrimSpace(appVersion); version != "" {
		return version
	}
	return "dev"
}

// DiagnosticsReport describes the installation, not the user. It names the
// storage mode rather than the workspace path, since the path routinely
// carries a client or project name.
func DiagnosticsReport() string {
	var b strings.Builder
	fmt.Fprintf(&b, "Relay %s\n", displayVersion())
	fmt.Fprintf(&b, "Platform:     %s/%s\n", runtime.GOOS, runtime.GOARCH)
	fmt.Fprintf(&b, "Go:           %s\n", runtime.Version())
	fmt.Fprintf(&b, "Build:        %s\n", buildKind())
	fmt.Fprintf(&b, "Git:          %s\n", gitVersionForDiagnostics())
	fmt.Fprintf(&b, "Workspace:    %s\n", workspaceModeForDiagnostics())
	fmt.Fprintf(&b, "Credentials:  %s\n", credentialStoreForDiagnostics())
	fmt.Fprintf(&b, "Log:          %s\n", logFileStateForDiagnostics())
	return b.String()
}

// logFileStateForDiagnostics reports whether there is a log to ask for. The
// path is Relay's own app-data directory, which carries no workspace detail.
func logFileStateForDiagnostics() string {
	path := LogFilePath()
	info, err := os.Stat(path)
	if err != nil {
		return "not written yet"
	}
	return fmt.Sprintf("%s (%d KB)", path, (info.Size()+1023)/1024)
}

func buildKind() string {
	if isDevBuild() {
		return "development"
	}
	return "release"
}

// gitVersionForDiagnostics reports what Relay would actually run, which is the
// first question to ask about any Git-backed workspace problem.
func gitVersionForDiagnostics() string {
	path, err := lookupGitExecutable()
	if err != nil {
		return "not found on PATH"
	}
	out, err := exec.Command(path, "--version").CombinedOutput()
	if err != nil {
		trimmed := strings.TrimSpace(string(out))
		if message := gitUnavailableMessage(trimmed, err); message != "" {
			// The multi-line install guidance belongs in the interface, not
			// in a one-line diagnostics field.
			return "installed but not usable"
		}
		if trimmed != "" {
			return trimmed
		}
		return "unusable: " + err.Error()
	}
	return strings.TrimSpace(string(out))
}

func workspaceModeForDiagnostics() string {
	switch fileWorkspaceStorageMode() {
	case workspaceStorageModeGit:
		return "folder (Git-backed)"
	case workspaceStorageModeLocal:
		return "app storage (local)"
	default:
		return "unknown"
	}
}

func credentialStoreForDiagnostics() string {
	if requestStoreKeychainDisabled() {
		return "recovery file only (" + requestStoreDisableKeychain + " is set)"
	}
	if !osCredentialStoreAvailable() {
		return "recovery file (no OS credential store reachable)"
	}
	return "OS credential store, with a recovery file"
}
