package main

import (
	"embed"
	"os"
	"runtime"

	"github.com/relay-client/relay/apps/desktop/internal/api"
	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/menu"
	"github.com/wailsapp/wails/v2/pkg/menu/keys"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/mac"
	winopts "github.com/wailsapp/wails/v2/pkg/options/windows"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	if len(os.Args) >= 2 && os.Args[1] == "git-credential" {
		os.Exit(api.RunGitCredentialHelper(os.Args[2:]))
	}
	if len(os.Args) >= 2 && os.Args[1] == "run" {
		os.Exit(api.RunCLI(os.Args[2:]))
	}

	app := api.NewApp()
	err := wails.Run(buildAppOptions(app, assets))
	if err != nil {
		println("Error:", err.Error())
	}
}

const relaySingleInstanceID = "com.relayclient.relay"

func buildAppOptions(app *api.App, frontendAssets embed.FS) *options.App {
	bgR, bgG, bgB, bgA := api.InitialWindowBackgroundRGBA()

	return &options.App{
		Title:             "Relay",
		Width:             1280,
		Height:            820,
		MinWidth:          1120,
		MinHeight:         680,
		HideWindowOnClose: true,
		// Windows draws an opaque native title bar that clashes with Relay's
		// chrome. Go frameless there and render our own controls in the top bar
		// (matches the seamless macOS title bar). macOS/Linux keep their native
		// frames.
		Frameless: runtime.GOOS == "windows",
		AssetServer: &assetserver.Options{
			Assets: frontendAssets,
		},
		BackgroundColour: options.NewRGBA(bgR, bgG, bgB, bgA),
		Menu:             buildMenu(app),
		OnStartup:        app.Startup,
		OnBeforeClose:    app.BeforeClose,
		OnShutdown:       app.Shutdown,
		SingleInstanceLock: newSingleInstanceLock(func() {
			app.Show()
		}),
		Mac: &mac.Options{
			TitleBar: &mac.TitleBar{
				TitlebarAppearsTransparent: true,
				HideTitle:                  true,
				HideTitleBar:               false,
				FullSizeContent:            true,
				UseToolbar:                 false,
			},
			WebviewIsTransparent: true,
			WindowIsTranslucent:  false,
		},
		Windows: buildWindowsOptions(api.InitialWindowResolvedTheme()),
		Bind: []interface{}{
			app,
		},
	}
}

func newSingleInstanceLock(showExistingWindow func()) *options.SingleInstanceLock {
	if showExistingWindow == nil {
		showExistingWindow = func() {}
	}
	return &options.SingleInstanceLock{
		UniqueId: relaySingleInstanceID,
		OnSecondInstanceLaunch: func(_ options.SecondInstanceData) {
			showExistingWindow()
		},
	}
}

func buildWindowsOptions(resolvedTheme string) *winopts.Options {
	theme := winopts.Dark
	if resolvedTheme == "light" {
		theme = winopts.Light
	}
	return &winopts.Options{
		Theme: theme,
		CustomTheme: &winopts.ThemeSettings{
			DarkModeTitleBar:           winopts.RGB(34, 34, 36),
			DarkModeTitleBarInactive:   winopts.RGB(26, 26, 26),
			DarkModeTitleText:          winopts.RGB(204, 204, 204),
			DarkModeTitleTextInactive:  winopts.RGB(153, 153, 153),
			DarkModeBorder:             winopts.RGB(68, 68, 68),
			DarkModeBorderInactive:     winopts.RGB(51, 51, 51),
			LightModeTitleBar:          winopts.RGB(248, 248, 248),
			LightModeTitleBarInactive:  winopts.RGB(246, 246, 246),
			LightModeTitleText:         winopts.RGB(52, 52, 52),
			LightModeTitleTextInactive: winopts.RGB(131, 131, 131),
			LightModeBorder:            winopts.RGB(204, 204, 204),
			LightModeBorderInactive:    winopts.RGB(229, 229, 229),
		},
	}
}

func buildMenu(app *api.App) *menu.Menu {
	if runtime.GOOS == "darwin" {
		return menu.NewMenuFromItems(
			menu.AppMenu(),
			menu.EditMenu(),
			menu.WindowMenu(),
		)
	}

	appMenu := menu.NewMenu()

	relay := appMenu.AddSubmenu("Relay")
	relay.AddText("Show Window", nil, func(_ *menu.CallbackData) { app.Show() })
	relay.AddText("Hide Window", nil, func(_ *menu.CallbackData) { app.Hide() })
	relay.AddSeparator()
	relay.AddText("Quit", keys.CmdOrCtrl("q"), func(_ *menu.CallbackData) { app.Quit() })

	return appMenu
}
