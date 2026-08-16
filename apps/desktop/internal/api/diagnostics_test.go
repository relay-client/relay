package api

import (
	"runtime"
	"strings"
	"testing"
)

func TestVersionLineNamesTheBuildAndPlatform(t *testing.T) {
	original := appVersion
	appVersion = "1.4.0"
	t.Cleanup(func() { appVersion = original })

	line := VersionLine()

	if !strings.Contains(line, "1.4.0") {
		t.Fatalf("expected the version in %q", line)
	}
	if !strings.Contains(line, runtime.GOOS) || !strings.Contains(line, runtime.GOARCH) {
		t.Fatalf("expected the platform in %q", line)
	}
	if strings.Contains(line, "\n") {
		// The release smoke test compares this against the tag, and a user
		// pastes it into an issue title.
		t.Fatalf("the version line must stay on one line, got %q", line)
	}
}

func TestVersionLineFallsBackToDev(t *testing.T) {
	original := appVersion
	appVersion = "  "
	t.Cleanup(func() { appVersion = original })

	if got := VersionLine(); !strings.Contains(got, "dev") {
		t.Fatalf("expected an unstamped build to read as dev, got %q", got)
	}
}

func TestDiagnosticsReportCoversWhatABugReportNeeds(t *testing.T) {
	report := DiagnosticsReport()

	for _, field := range []string{"Platform:", "Go:", "Build:", "Git:", "Workspace:", "Credentials:"} {
		if !strings.Contains(report, field) {
			t.Fatalf("expected %q in the report:\n%s", field, report)
		}
	}
	if !strings.HasSuffix(report, "\n") {
		t.Fatalf("expected the report to end with a newline, got %q", report)
	}
}

func TestDiagnosticsReportKeepsTheWorkspacePathOut(t *testing.T) {
	// The report is meant to be pasted into a public issue. A workspace path
	// routinely carries a client or project name, so the mode is reported
	// instead of the location.
	report := DiagnosticsReport()

	if path := fileWorkspaceStorePath(); path != "" && strings.Contains(report, path) {
		t.Fatalf("the workspace path must not appear in the report:\n%s", report)
	}
}

func TestDiagnosticsSaysSoWhenGitIsMissing(t *testing.T) {
	withoutGit(t)

	report := DiagnosticsReport()

	if !strings.Contains(report, "Git:          not found on PATH") {
		t.Fatalf("expected the report to name a missing Git:\n%s", report)
	}
	// The multi-line install guidance belongs in the interface; the report
	// keeps one line per field.
	for _, line := range strings.Split(strings.TrimSpace(report), "\n") {
		if strings.HasPrefix(line, "Git:") && strings.Contains(line, "https://") {
			t.Fatalf("expected a short Git field, got %q", line)
		}
	}
}

func TestDiagnosticsReportsTheInstalledGitVersion(t *testing.T) {
	requireGitBinary(t)

	report := DiagnosticsReport()

	if !strings.Contains(report, "git version") {
		t.Fatalf("expected the installed Git version in the report:\n%s", report)
	}
}
