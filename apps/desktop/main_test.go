package main

import (
	"embed"
	"slices"
	"testing"

	"github.com/stormhop/kurlo/apps/desktop/internal/api"
	"github.com/wailsapp/wails/v2/pkg/menu"
	"github.com/wailsapp/wails/v2/pkg/options"
	winopts "github.com/wailsapp/wails/v2/pkg/options/windows"
)

func TestBuildAppOptionsEnablesSingleInstanceLock(t *testing.T) {
	app := api.NewApp()
	opts := buildAppOptions(app, embed.FS{})

	if opts.SingleInstanceLock == nil {
		t.Fatalf("expected single instance lock to be configured")
	}
	if got := opts.SingleInstanceLock.UniqueId; got != kurloSingleInstanceID {
		t.Fatalf("expected single instance id %q, got %q", kurloSingleInstanceID, got)
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

func TestOnlyMacOSHidesTheWindowOnClose(t *testing.T) {
	if !hideWindowOnClose("darwin") {
		t.Fatalf("expected macOS to keep the app alive in the Dock when the window closes")
	}
	for _, goos := range []string{"linux", "windows"} {
		if hideWindowOnClose(goos) {
			t.Fatalf("expected closing the window on %s to quit, not hide into an unreachable process", goos)
		}
	}
}

func TestNonMacMenuOffersNoWayToHideTheWindow(t *testing.T) {
	for _, goos := range []string{"linux", "windows"} {
		var labels []string
		var walk func(items []*menu.MenuItem)
		walk = func(items []*menu.MenuItem) {
			for _, item := range items {
				labels = append(labels, item.Label)
				if item.SubMenu != nil {
					walk(item.SubMenu.Items)
				}
			}
		}
		walk(buildMenuFor(api.NewApp(), goos).Items)

		for _, label := range labels {
			if label == "Hide Window" || label == "Show Window" {
				t.Fatalf("%s menu still offers %q: %v", goos, label, labels)
			}
		}
		if !slices.Contains(labels, "Quit") {
			t.Fatalf("%s menu lost Quit: %v", goos, labels)
		}
	}
}
