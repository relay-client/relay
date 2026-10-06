package api

import (
	"context"
	"log"
	"sync"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

const beforeQuitEvent = "kurlo:before-quit"

const defaultQuitAckTimeout = 5 * time.Second

type quitGate struct {
	mu         sync.Mutex
	allow      bool
	pending    bool
	acked      bool
	attempt    uint64
	ackTimeout time.Duration
	notify     func(ctx context.Context)
	quit       func(ctx context.Context)
}

func newQuitGate() *quitGate {
	return &quitGate{
		ackTimeout: defaultQuitAckTimeout,
		notify:     func(ctx context.Context) { runtime.EventsEmit(ctx, beforeQuitEvent) },
		quit:       runtime.Quit,
	}
}

func (g *quitGate) beforeClose(ctx context.Context) bool {
	g.mu.Lock()
	if g.allow {
		g.mu.Unlock()
		return false
	}
	if g.pending {
		g.mu.Unlock()
		return true
	}
	g.pending = true
	g.acked = false
	g.attempt++
	attempt := g.attempt
	timeout := g.ackTimeout
	g.mu.Unlock()

	g.notify(ctx)
	time.AfterFunc(timeout, func() { g.quitIfUnacknowledged(ctx, attempt, timeout) })
	return true
}

func (g *quitGate) quitIfUnacknowledged(ctx context.Context, attempt uint64, timeout time.Duration) {
	g.mu.Lock()
	if !g.pending || g.acked || g.attempt != attempt {
		g.mu.Unlock()
		return
	}
	g.allow = true
	g.pending = false
	g.mu.Unlock()
	log.Printf("kurlo: the window did not answer the quit request within %s; quitting without it", timeout)
	g.quit(ctx)
}

func (g *quitGate) acknowledge() {
	g.mu.Lock()
	if g.pending {
		g.acked = true
	}
	g.mu.Unlock()
}

func (g *quitGate) confirm(ctx context.Context) {
	g.mu.Lock()
	g.allow = true
	g.pending = false
	g.mu.Unlock()
	g.quit(ctx)
}

func (g *quitGate) cancel() {
	g.mu.Lock()
	g.pending = false
	g.acked = false
	g.mu.Unlock()
}
