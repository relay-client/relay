package api

import (
	"os"
	"os/exec"
	"strconv"
	"testing"
	"time"
)

func TestTakeRelaunchWaitReadsAndStripsThePreviousPID(t *testing.T) {
	args, pid := TakeRelaunchWait(append([]string{"kurlo"}, relaunchArgs(4242)...))
	if pid != 4242 {
		t.Fatalf("expected pid 4242, got %d", pid)
	}
	if len(args) != 1 || args[0] != "kurlo" {
		t.Fatalf("expected the flag to be stripped, got %v", args)
	}
}

func TestTakeRelaunchWaitLeavesOtherArgumentsAlone(t *testing.T) {
	for _, in := range [][]string{
		{"kurlo"},
		{"kurlo", "run", "collection.json"},
		{"kurlo", "--version"},
	} {
		args, pid := TakeRelaunchWait(in)
		if pid != 0 || len(args) != len(in) {
			t.Fatalf("expected %v untouched, got %v pid=%d", in, args, pid)
		}
	}
}

func TestTakeRelaunchWaitIgnoresAnUnusablePID(t *testing.T) {
	for _, value := range []string{"", "abc", "0", "-5", strconv.Itoa(os.Getpid())} {
		args, pid := TakeRelaunchWait([]string{"kurlo", relaunchAfterFlag + value})
		if pid != 0 {
			t.Fatalf("%q: expected no wait, got pid %d", value, pid)
		}
		if len(args) != 1 {
			t.Fatalf("%q: expected the flag to be stripped, got %v", value, args)
		}
	}
}

func TestRelaunchTargetStartsTheAppImageOnLinux(t *testing.T) {
	if got := relaunchTarget("linux", "/tmp/.mount_Kurlo/usr/bin/kurlo", "/home/u/Kurlo.AppImage"); got != "/home/u/Kurlo.AppImage" {
		t.Fatalf("expected the AppImage, got %q", got)
	}
	if got := relaunchTarget("linux", "/usr/local/bin/kurlo", ""); got != "/usr/local/bin/kurlo" {
		t.Fatalf("expected the binary, got %q", got)
	}
	if got := relaunchTarget("windows", `C:\Kurlo\kurlo.exe`, "/ignored"); got != `C:\Kurlo\kurlo.exe` {
		t.Fatalf("expected the exe, got %q", got)
	}
}

func TestHelperProcessSleeps(t *testing.T) {
	ms := os.Getenv("KURLO_TEST_SLEEP_MS")
	if ms == "" {
		return
	}
	n, _ := strconv.Atoi(ms)
	time.Sleep(time.Duration(n) * time.Millisecond)
	os.Exit(0)
}

func startSleepingHelper(t *testing.T, d time.Duration) *exec.Cmd {
	t.Helper()
	cmd := exec.Command(os.Args[0], "-test.run=^TestHelperProcessSleeps$")
	cmd.Env = append(os.Environ(), "KURLO_TEST_SLEEP_MS="+strconv.Itoa(int(d/time.Millisecond)))
	if err := cmd.Start(); err != nil {
		t.Fatal(err)
	}
	go func() { _ = cmd.Wait() }()
	t.Cleanup(func() { _ = cmd.Process.Kill() })
	return cmd
}

func TestWaitForProcessExitReturnsOnceThePreviousInstanceIsGone(t *testing.T) {
	cmd := startSleepingHelper(t, 400*time.Millisecond)
	started := time.Now()
	if !waitForProcessExit(cmd.Process.Pid, 10*time.Second) {
		t.Fatal("expected the wait to see the process exit")
	}
	if elapsed := time.Since(started); elapsed < 300*time.Millisecond {
		t.Fatalf("returned after %s, before the previous instance had exited", elapsed)
	}
}

func TestWaitForProcessExitGivesUpAfterTheTimeout(t *testing.T) {
	cmd := startSleepingHelper(t, 10*time.Second)
	started := time.Now()
	if waitForProcessExit(cmd.Process.Pid, 200*time.Millisecond) {
		t.Fatal("expected the wait to report the process still running")
	}
	if elapsed := time.Since(started); elapsed > 3*time.Second {
		t.Fatalf("the timeout was not honoured, waited %s", elapsed)
	}
}

func TestWaitForProcessExitTreatsAMissingProcessAsGone(t *testing.T) {
	cmd := startSleepingHelper(t, 0)
	pid := cmd.Process.Pid
	deadline := time.Now().Add(5 * time.Second)
	for !waitForProcessExit(pid, 50*time.Millisecond) {
		if time.Now().After(deadline) {
			t.Fatal("a finished process should count as gone")
		}
	}
}

func TestRelaunchUsesThePathKurloWasStartedFrom(t *testing.T) {
	if launchExecutable == "" {
		t.Fatal("expected the launch path to be recorded at startup")
	}
	if got := relaunchExecutable("/home/u/bin/kurlo", "/home/u/bin/.kurlo.old"); got != "/home/u/bin/kurlo" {
		t.Fatalf("an update renames the running file away; expected the launch path, got %q", got)
	}
	if got := relaunchExecutable("", "/home/u/bin/kurlo"); got != "/home/u/bin/kurlo" {
		t.Fatalf("expected the current path as a fallback, got %q", got)
	}
}

func TestRelaunchCommandStartsTheTargetWithThePreviousPID(t *testing.T) {
	cmd := relaunchCommand("/home/u/bin/kurlo", 4242)
	if cmd.Path != "/home/u/bin/kurlo" {
		t.Fatalf("expected the target path, got %q", cmd.Path)
	}
	if len(cmd.Args) != 2 || cmd.Args[1] != relaunchAfterFlag+"4242" {
		t.Fatalf("expected the relaunch flag, got %v", cmd.Args)
	}
}
