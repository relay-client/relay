//go:build !windows

package api

import "os/exec"

func hideCmdWindow(*exec.Cmd) {}
