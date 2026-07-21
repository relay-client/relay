package api

import (
	"context"
	"crypto/tls"
	"net/http/httptrace"
	"testing"
	"time"
)

func TestDurationBetween(t *testing.T) {
	base := time.Now()
	if d := durationBetween(time.Time{}, base); d != 0 {
		t.Errorf("zero start should yield 0, got %v", d)
	}
	if d := durationBetween(base, time.Time{}); d != 0 {
		t.Errorf("zero finish should yield 0, got %v", d)
	}
	if d := durationBetween(base.Add(time.Second), base); d != 0 {
		t.Errorf("finish before start should yield 0, got %v", d)
	}
	if d := durationBetween(base, base.Add(2*time.Second)); d != 2*time.Second {
		t.Errorf("expected 2s, got %v", d)
	}
}

func TestRoundMillis(t *testing.T) {
	cases := map[time.Duration]float64{
		0:                       0,
		-5 * time.Millisecond:   0,
		1500 * time.Microsecond: 1.5,
		1234 * time.Microsecond: 1.23,
		2 * time.Millisecond:    2,
	}
	for in, want := range cases {
		if got := roundMillis(in); got != want {
			t.Errorf("roundMillis(%v) = %v, want %v", in, got, want)
		}
	}
}

func TestMillisBetween(t *testing.T) {
	base := time.Now()
	if got := millisBetween(base, base.Add(3*time.Millisecond)); got != 3 {
		t.Errorf("millisBetween = %v, want 3", got)
	}
	if got := millisBetween(base, base); got != 0 {
		t.Errorf("equal times should be 0, got %v", got)
	}
}

// Drive the httptrace callbacks in order and verify the snapshot attributes
// non-negative, sensible durations to each phase.
func TestResponseTimingSnapshot(t *testing.T) {
	start := time.Now()
	_, rec := withResponseTiming(context.Background(), start)
	trace := rec.clientTrace()
	step := 3 * time.Millisecond

	trace.GetConn("example.com:443")
	trace.DNSStart(httptrace.DNSStartInfo{Host: "example.com"})
	time.Sleep(step)
	trace.DNSDone(httptrace.DNSDoneInfo{})
	trace.ConnectStart("tcp", "93.184.216.34:443")
	time.Sleep(step)
	trace.ConnectDone("tcp", "93.184.216.34:443", nil)
	trace.TLSHandshakeStart()
	time.Sleep(step)
	trace.TLSHandshakeDone(tls.ConnectionState{}, nil)
	trace.GotConn(httptrace.GotConnInfo{})
	rec.markPrepared()
	trace.WroteRequest(httptrace.WroteRequestInfo{})
	time.Sleep(step)
	trace.GotFirstResponseByte()
	time.Sleep(step)
	finish := time.Now()

	snap := rec.snapshot(finish)

	if snap.Total <= 0 {
		t.Fatalf("expected positive total, got %v", snap.Total)
	}
	for name, v := range map[string]float64{
		"dns": snap.DNSLookup, "tcp": snap.TCPHandshake,
		"tls": snap.TLSHandshake, "waiting": snap.WaitingTTFB,
	} {
		if v <= 0 {
			t.Errorf("expected positive %s phase, got %v", name, v)
		}
	}
	for name, v := range map[string]float64{
		"prepare": snap.Prepare, "socket": snap.SocketInitialization,
		"download": snap.Download, "process": snap.Process,
	} {
		if v < 0 {
			t.Errorf("phase %s must not be negative, got %v", name, v)
		}
	}
}

func TestResponseTimingSnapshotEmpty(t *testing.T) {
	start := time.Now()
	_, rec := withResponseTiming(context.Background(), start)
	snap := rec.snapshot(start.Add(10 * time.Millisecond))
	if snap.Total != 10 {
		t.Errorf("expected total 10ms, got %v", snap.Total)
	}
	// No trace callbacks fired: phase breakdowns stay zero, process absorbs the rest.
	if snap.DNSLookup != 0 || snap.TCPHandshake != 0 || snap.TLSHandshake != 0 {
		t.Errorf("expected zero network phases, got %+v", snap)
	}
}
