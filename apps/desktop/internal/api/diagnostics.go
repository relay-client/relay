package api

import (
	"fmt"
	"os"
	"os/exec"
	"runtime"
	"strings"
)

func VersionLine() string {
	return fmt.Sprintf("Relay %s (%s/%s)", displayVersion(), runtime.GOOS, runtime.GOARCH)
}

func displayVersion() string {
	if version := strings.TrimSpace(appVersion); version != "" {
		return version
	}
	return "dev"
}

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

func gitVersionForDiagnostics() string {
	path, err := lookupGitExecutable()
	if err != nil {
		return "not found on PATH"
	}
	out, err := exec.Command(path, "--version").CombinedOutput()
	if err != nil {
		trimmed := strings.TrimSpace(string(out))
		if message := gitUnavailableMessage(trimmed, err); message != "" {
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
