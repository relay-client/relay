package api

import (
	"context"
	"crypto/tls"
	"math"
	"net/http/httptrace"
	"sync"
	"time"

	"github.com/relay-client/relay/apps/desktop/internal/model"
)

type responseTimingRecorder struct {
	mu sync.Mutex

	start       time.Time
	prepareDone time.Time

	getConn        time.Time
	socketRecorded bool

	dnsStart     time.Time
	connectStart time.Time
	tlsStart     time.Time
	wroteRequest time.Time

	socketTotal  time.Duration
	dnsTotal     time.Duration
	tcpTotal     time.Duration
	tlsTotal     time.Duration
	waitingTotal time.Duration

	firstResponseByte time.Time
	lastResponseByte  time.Time
}

func withResponseTiming(ctx context.Context, start time.Time) (context.Context, *responseTimingRecorder) {
	rec := &responseTimingRecorder{start: start}
	return httptrace.WithClientTrace(ctx, rec.clientTrace()), rec
}

func (r *responseTimingRecorder) markPrepared() {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.prepareDone.IsZero() {
		r.prepareDone = time.Now()
	}
}

func (r *responseTimingRecorder) snapshot(finish time.Time) model.ResponseTime {
	r.mu.Lock()
	defer r.mu.Unlock()

	download := time.Duration(0)
	if !r.lastResponseByte.IsZero() && finish.After(r.lastResponseByte) {
		download = finish.Sub(r.lastResponseByte)
	}
	prepare := durationBetween(r.start, r.prepareDone)
	process := durationBetween(r.start, finish) - prepare - r.socketTotal - r.dnsTotal - r.tcpTotal - r.tlsTotal - r.waitingTotal - download
	if process < 0 {
		process = 0
	}

	return model.ResponseTime{
		Total:                millisBetween(r.start, finish),
		Prepare:              roundMillis(prepare),
		SocketInitialization: roundMillis(r.socketTotal),
		DNSLookup:            roundMillis(r.dnsTotal),
		TCPHandshake:         roundMillis(r.tcpTotal),
		TLSHandshake:         roundMillis(r.tlsTotal),
		WaitingTTFB:          roundMillis(r.waitingTotal),
		Download:             roundMillis(download),
		Process:              roundMillis(process),
	}
}

func (r *responseTimingRecorder) clientTrace() *httptrace.ClientTrace {
	return &httptrace.ClientTrace{
		GetConn: func(_ string) {
			r.mu.Lock()
			defer r.mu.Unlock()
			r.getConn = time.Now()
			r.socketRecorded = false
		},
		DNSStart: func(_ httptrace.DNSStartInfo) {
			r.mu.Lock()
			defer r.mu.Unlock()
			now := time.Now()
			r.recordSocketStartLocked(now)
			r.dnsStart = now
		},
		DNSDone: func(_ httptrace.DNSDoneInfo) {
			r.mu.Lock()
			defer r.mu.Unlock()
			now := time.Now()
			if !r.dnsStart.IsZero() && now.After(r.dnsStart) {
				r.dnsTotal += now.Sub(r.dnsStart)
			}
			r.dnsStart = time.Time{}
		},
		ConnectStart: func(_, _ string) {
			r.mu.Lock()
			defer r.mu.Unlock()
			now := time.Now()
			r.recordSocketStartLocked(now)
			r.connectStart = now
		},
		ConnectDone: func(_, _ string, _ error) {
			r.mu.Lock()
			defer r.mu.Unlock()
			now := time.Now()
			if !r.connectStart.IsZero() && now.After(r.connectStart) {
				r.tcpTotal += now.Sub(r.connectStart)
			}
			r.connectStart = time.Time{}
		},
		TLSHandshakeStart: func() {
			r.mu.Lock()
			defer r.mu.Unlock()
			r.tlsStart = time.Now()
		},
		TLSHandshakeDone: func(_ tls.ConnectionState, _ error) {
			r.mu.Lock()
			defer r.mu.Unlock()
			now := time.Now()
			if !r.tlsStart.IsZero() && now.After(r.tlsStart) {
				r.tlsTotal += now.Sub(r.tlsStart)
			}
			r.tlsStart = time.Time{}
		},
		GotConn: func(_ httptrace.GotConnInfo) {
			r.mu.Lock()
			defer r.mu.Unlock()
			now := time.Now()
			if !r.socketRecorded && !r.getConn.IsZero() && now.After(r.getConn) {
				r.socketTotal += now.Sub(r.getConn)
				r.socketRecorded = true
			}
		},
		WroteRequest: func(_ httptrace.WroteRequestInfo) {
			r.mu.Lock()
			defer r.mu.Unlock()
			r.wroteRequest = time.Now()
		},
		GotFirstResponseByte: func() {
			r.mu.Lock()
			defer r.mu.Unlock()
			now := time.Now()
			if r.firstResponseByte.IsZero() {
				r.firstResponseByte = now
			}
			r.lastResponseByte = now
			if !r.wroteRequest.IsZero() && now.After(r.wroteRequest) {
				r.waitingTotal += now.Sub(r.wroteRequest)
			}
			r.wroteRequest = time.Time{}
		},
	}
}

func (r *responseTimingRecorder) recordSocketStartLocked(now time.Time) {
	if r.socketRecorded || r.getConn.IsZero() || !now.After(r.getConn) {
		return
	}
	r.socketTotal += now.Sub(r.getConn)
	r.socketRecorded = true
}

func millisBetween(start, finish time.Time) float64 {
	return roundMillis(durationBetween(start, finish))
}

func durationBetween(start, finish time.Time) time.Duration {
	if start.IsZero() || finish.IsZero() || !finish.After(start) {
		return 0
	}
	return finish.Sub(start)
}

func roundMillis(d time.Duration) float64 {
	if d <= 0 {
		return 0
	}
	return math.Round((float64(d)/float64(time.Millisecond))*100) / 100
}
