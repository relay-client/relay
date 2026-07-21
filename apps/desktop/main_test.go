package main

import (
	"embed"
	"testing"

	"github.com/relay-client/relay/apps/desktop/internal/api"
	"github.com/wailsapp/wails/v2/pkg/options"
	winopts "github.com/wailsapp/wails/v2/pkg/options/windows"
)

func TestBuildAppOptionsEnablesSingleInstanceLock(t *testing.T) {
	app := api.NewApp()
	opts := buildAppOptions(app, embed.FS{})

	if opts.SingleInstanceLock == nil {
		t.Fatalf("expected single instance lock to be configured")
	}
	if got := opts.SingleInstanceLock.UniqueId; got != relaySingleInstanceID {
		t.Fatalf("expected single instance id %q, got %q", relaySingleInstanceID, got)
	}
	if opts.SingleInstanceLock.OnSecondInstanceLaunch == nil {
		t.Fatalf("expected second instance launch callback to be configured")
	}
}

func TestSingleInstanceLockShowsExistingWindowOnSecondLaunch(t *testing.T) {
	calls := 0
	lock := newSingleInstanceLock(func() {
		calls++
	})

	lock.OnSecondInstanceLaunch(options.SecondInstanceData{
		Args:             []string{"--activate"},
		WorkingDirectory: t.TempDir(),
	})

	if calls != 1 {
		t.Fatalf("expected existing window to be shown once, got %d calls", calls)
	}
}

func TestBuildWindowsOptionsUsesResolvedTheme(t *testing.T) {
	if got := buildWindowsOptions("dark").Theme; got != winopts.Dark {
		t.Fatalf("expected dark Windows titlebar theme, got %v", got)
	}
	if got := buildWindowsOptions("light").Theme; got != winopts.Light {
		t.Fatalf("expected light Windows titlebar theme, got %v", got)
	}
	if buildWindowsOptions("dark").CustomTheme == nil {
		t.Fatalf("expected Windows custom titlebar colors to be configured")
	}
}
