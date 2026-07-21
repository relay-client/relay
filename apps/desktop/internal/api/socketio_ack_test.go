package api

import (
	"testing"
	"time"
)

// Bug #5 regression: emitted-with-ack entries that never receive a server ack
// must be evicted after the timeout instead of growing pendingAcks for the life
// of the session.
func TestSocketIOPendingAckEviction(t *testing.T) {
	prev := socketIOAckTimeout
	socketIOAckTimeout = 20 * time.Millisecond
	t.Cleanup(func() { socketIOAckTimeout = prev })

	m := newSocketIOManager(nil)
	m.registerPendingAck("session-1", "evt")
	m.registerPendingAck("session-1", "evt2")

	if got := m.pendingAckCount("session-1"); got != 2 {
		t.Fatalf("expected 2 pending acks, got %d", got)
	}

	time.Sleep(80 * time.Millisecond)

	if got := m.pendingAckCount("session-1"); got != 0 {
		t.Fatalf("expected pending acks to be evicted after timeout, got %d", got)
	}
}

func TestSocketIOPendingAckMonotonicIDs(t *testing.T) {
	prev := socketIOAckTimeout
	socketIOAckTimeout = 0 // disable eviction for this test
	t.Cleanup(func() { socketIOAckTimeout = prev })

	m := newSocketIOManager(nil)
	id1, ch1 := m.registerPendingAck("s", "a")
	id2, ch2 := m.registerPendingAck("s", "b")
	if id1 == id2 {
		t.Fatalf("expected distinct ack ids, got %d twice", id1)
	}
	if ch1 == nil || ch2 == nil {
		t.Fatal("expected non-nil ack channels")
	}
	if got := m.pendingAckCount("s"); got != 2 {
		t.Fatalf("expected 2 pending acks with eviction disabled, got %d", got)
	}
}
