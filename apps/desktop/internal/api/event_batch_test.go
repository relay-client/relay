package api

import (
	"sync"
	"testing"
	"time"
)

// Bug #1 regression: a burst of events followed by silence must still be
// delivered within the window via the background timer, not stall until the
// next event or the connection close.
func TestEventBatcherFlushesIdleTail(t *testing.T) {
	var mu sync.Mutex
	var delivered []int
	record := func(v int) { mu.Lock(); delivered = append(delivered, v); mu.Unlock() }

	b := newEventBatcher[int](100, 20*time.Millisecond,
		func(v int) { record(v) },
		func(vs []int) {
			for _, v := range vs {
				record(v)
			}
		},
	)

	b.add(1)
	b.add(2)
	b.add(3)

	time.Sleep(80 * time.Millisecond)

	mu.Lock()
	defer mu.Unlock()
	if len(delivered) != 3 {
		t.Fatalf("expected 3 events delivered after idle window, got %d (%v)", len(delivered), delivered)
	}
}

func TestEventBatcherFlushesAtMax(t *testing.T) {
	var batches [][]int
	b := newEventBatcher[int](2, time.Hour,
		func(int) { t.Fatal("did not expect single emit when max is reached") },
		func(vs []int) { batches = append(batches, append([]int(nil), vs...)) },
	)
	b.add(1)
	b.add(2) // hits max=2 -> immediate flush, no timer wait
	if len(batches) != 1 || len(batches[0]) != 2 {
		t.Fatalf("expected one batch of 2, got %v", batches)
	}
}

func TestEventBatcherExplicitFlushSingle(t *testing.T) {
	got := -1
	b := newEventBatcher[int](100, time.Hour,
		func(v int) { got = v },
		func([]int) { t.Fatal("did not expect batch emit for a single item") },
	)
	b.add(42)
	b.flush()
	if got != 42 {
		t.Fatalf("expected explicit flush to emit 42, got %d", got)
	}
}

func TestEventBatcherFlushEmptyIsNoop(t *testing.T) {
	b := newEventBatcher[int](100, time.Hour,
		func(int) { t.Fatal("no single emit expected") },
		func([]int) { t.Fatal("no batch emit expected") },
	)
	b.flush()
}
