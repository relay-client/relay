package api

import (
	"sync"
	"time"
)

// eventBatcher coalesces high-frequency stream events into batches that are
// flushed when the batch fills up OR after a fixed window — including when the
// stream goes idle, via a background timer. Without the timer the tail of a
// burst would sit undelivered until the next event or the connection close.
//
// All state is guarded by mu so the timer goroutine and the producing read
// loop can call add/flush concurrently. emitOne/emitMany run while mu is held;
// they must not call back into the batcher (in practice they only push to the
// Wails event bus).
type eventBatcher[T any] struct {
	mu       sync.Mutex
	items    []T
	max      int
	window   time.Duration
	emitOne  func(T)
	emitMany func([]T)
	timer    *time.Timer
}

func newEventBatcher[T any](max int, window time.Duration, emitOne func(T), emitMany func([]T)) *eventBatcher[T] {
	return &eventBatcher[T]{
		max:      max,
		window:   window,
		emitOne:  emitOne,
		emitMany: emitMany,
	}
}

func (b *eventBatcher[T]) add(item T) {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.items = append(b.items, item)
	if b.max > 0 && len(b.items) >= b.max {
		b.flushLocked()
		return
	}
	if b.timer == nil && b.window > 0 {
		b.timer = time.AfterFunc(b.window, b.flushFromTimer)
	}
}

func (b *eventBatcher[T]) flush() {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.flushLocked()
}

func (b *eventBatcher[T]) flushFromTimer() {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.flushLocked()
}

func (b *eventBatcher[T]) flushLocked() {
	if b.timer != nil {
		b.timer.Stop()
		b.timer = nil
	}
	if len(b.items) == 0 {
		return
	}
	items := b.items
	b.items = nil
	if len(items) == 1 {
		b.emitOne(items[0])
		return
	}
	b.emitMany(items)
}
