//go:build windows

package api

import "testing"

func TestRelaunchCommandKeepsTheNewWindowVisible(t *testing.T) {
	cmd := relaunchCommand(`C:\Kurlo\kurlo.exe`, 4242)
	if cmd.SysProcAttr == nil {
		return
	}
	if cmd.SysProcAttr.HideWindow {
		t.Fatal("a relaunched Kurlo must not start with SW_HIDE, or its window stays hidden")
	}
	if cmd.SysProcAttr.CreationFlags&createNoWindow != 0 {
		t.Fatal("a relaunched Kurlo must not start with CREATE_NO_WINDOW")
	}
}
