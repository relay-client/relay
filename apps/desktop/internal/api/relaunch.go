package api

import (
	"os"
	"os/exec"
	"strconv"
	"strings"
	"time"
)

const relaunchAfterFlag = "--relaunch-after="

const relaunchWaitTimeout = 15 * time.Second

var launchExecutable = currentExecutable()

func currentExecutable() string {
	exe, err := os.Executable()
	if err != nil {
		return ""
	}
	return exe
}

func relaunchExecutable(launched, current string) string {
	if launched != "" {
		return launched
	}
	return current
}

func relaunchArgs(pid int) []string {
	return []string{relaunchAfterFlag + strconv.Itoa(pid)}
}

func relaunchCommand(target string, pid int) *exec.Cmd {
	return exec.Command(target, relaunchArgs(pid)...)
}

func relaunchTarget(goos, exe, appImage string) string {
	if goos == "linux" && appImage != "" {
		return appImage
	}
	return exe
}

func TakeRelaunchWait(args []string) ([]string, int) {
	if len(args) < 2 || !strings.HasPrefix(args[1], relaunchAfterFlag) {
		return args, 0
	}
	pid, err := strconv.Atoi(strings.TrimPrefix(args[1], relaunchAfterFlag))
	rest := append([]string{args[0]}, args[2:]...)
	if err != nil || pid <= 0 || pid == os.Getpid() {
		return rest, 0
	}
	return rest, pid
}

func WaitForPreviousInstance(pid int) {
	if pid <= 0 {
		return
	}
	waitForProcessExit(pid, relaunchWaitTimeout)
}
