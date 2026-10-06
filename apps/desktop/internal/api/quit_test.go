package api

import (
	"context"
	"sync/atomic"
	"testing"
	"time"
)

type recordingQuitGate struct {
	*quitGate
	notified atomic.Int32
	quits    chan struct{}
}

func newRecordingQuitGate(timeout time.Duration) *recordingQuitGate {
	r := &recordingQuitGate{quitGate: newQuitGate(), quits: make(chan struct{}, 4)}
	r.ackTimeout = timeout
	r.notify = func(context.Context) { r.notified.Add(1) }
	r.quit = func(context.Context) { r.quits <- struct{}{} }
	return r
}

func (r *recordingQuitGate) expectQuit(t *testing.T, within time.Duration) {
	t.Helper()
	select {
	case <-r.quits:
	case <-time.After(within):
		t.Fatalf("expected the app to quit within %s", within)
	}
}

func (r *recordingQuitGate) expectNoQuit(t *testing.T, during time.Duration) {
	t.Helper()
	select {
	case <-r.quits:
		t.Fatalf("expected the app to keep running")
	case <-time.After(during):
	}
}

func TestQuitGateQuitsWhenTheWindowNeverAnswers(t *testing.T) {
	g := newRecordingQuitGate(20 * time.Millisecond)
	ctx := context.Background()

	if !g.beforeClose(ctx) {
		t.Fatalf("expected the first close to wait for the window")
	}
	if got := g.notified.Load(); got != 1 {
		t.Fatalf("expected the window to be asked once, got %d", got)
	}
	g.expectQuit(t, time.Second)

	if g.beforeClose(ctx) {
		t.Fatalf("expected the close that follows a forced quit to go through")
	}
}

func TestQuitGateRepeatedQuitWhileWaitingStillEndsTheApp(t *testing.T) {
	g := newRecordingQuitGate(20 * time.Millisecond)
	ctx := context.Background()

	g.beforeClose(ctx)
	if !g.beforeClose(ctx) {
		t.Fatalf("expected a second close while waiting to be held")
	}
	if got := g.notified.Load(); got != 1 {
		t.Fatalf("expected one quit prompt for overlapping closes, got %d", got)
	}
	g.expectQuit(t, time.Second)
	g.expectNoQuit(t, 60*time.Millisecond)
}

func TestQuitGateWaitsForAnAcknowledgedReview(t *testing.T) {
	g := newRecordingQuitGate(20 * time.Millisecond)
	ctx := context.Background()

	g.beforeClose(ctx)
	g.acknowledge()
	g.expectNoQuit(t, 80*time.Millisecond)

	g.confirm(ctx)
	g.expectQuit(t, time.Second)
	if g.beforeClose(ctx) {
		t.Fatalf("expected the confirmed close to go through")
	}
}

func TestQuitGateCancelledReviewKeepsRunningAndCanQuitAgain(t *testing.T) {
	g := newRecordingQuitGate(20 * time.Millisecond)
	ctx := context.Background()

	g.beforeClose(ctx)
	g.acknowledge()
	g.cancel()
	g.expectNoQuit(t, 80*time.Millisecond)

	if !g.beforeClose(ctx) {
		t.Fatalf("expected a new close after cancel to ask the window again")
	}
	if got := g.notified.Load(); got != 2 {
		t.Fatalf("expected the window to be asked again, got %d prompts", got)
	}
	g.expectQuit(t, time.Second)
}

func TestQuitGateStaleTimerDoesNotEndALaterReview(t *testing.T) {
	g := newRecordingQuitGate(40 * time.Millisecond)
	ctx := context.Background()

	g.beforeClose(ctx)
	g.cancel()
	g.beforeClose(ctx)
	g.acknowledge()
	g.expectNoQuit(t, 120*time.Millisecond)
}

func TestQuitGateAckWithoutPendingQuitIsIgnored(t *testing.T) {
	g := newRecordingQuitGate(20 * time.Millisecond)
	ctx := context.Background()

	g.acknowledge()
	g.beforeClose(ctx)
	g.expectQuit(t, time.Second)
}
