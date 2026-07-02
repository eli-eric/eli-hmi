package main

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

// readPV returns the current simulated value of a PV (lock-safe).
func readPV(name string) interface{} {
	ps := getOrCreateSim(name)
	ps.mu.Lock()
	defer ps.mu.Unlock()
	return ps.value
}

func asInt(v interface{}) (int, bool) {
	switch n := v.(type) {
	case int:
		return n, true
	case int64:
		return int(n), true
	case float64:
		return int(n), true
	}
	return 0, false
}

// TestSequencerPerSequenceStatePoC verifies the proof-of-concept: firing a
// sequence command flips that sequence's state PV (and the overall Sequencer)
// to RUNNING (1) for the hold window, then back to IDLE (0).
func TestSequencerPerSequenceStatePoC(t *testing.T) {
	e := newServer()
	seedLaserPVs()

	const seqPV = "BI_NL2_SEQ_START_LASER"
	const runPV = "BI_NL2_SEQUENCER_RUNNING"

	// Seeded IDLE.
	if v, _ := asInt(readPV(seqPV)); v != 0 {
		t.Fatalf("expected %s seeded IDLE(0), got %v", seqPV, readPV(seqPV))
	}
	if v, _ := asInt(readPV(runPV)); v != 0 {
		t.Fatalf("expected %s seeded IDLE(0), got %v", runPV, readPV(runPV))
	}

	// Fire the command (POST /pv/CMD_NL2_START_LASER {"value":1}).
	body := strings.NewReader(`{"value":1}`)
	req := httptest.NewRequest(http.MethodPost, "/pv/CMD_NL2_START_LASER", body)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "test")
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("fire failed: status %d body %s", rec.Code, rec.Body.String())
	}

	// Immediately after the write the sequence + Sequencer read RUNNING(1).
	if v, _ := asInt(readPV(seqPV)); v != 1 {
		t.Fatalf("expected %s RUNNING(1) after fire, got %v", seqPV, readPV(seqPV))
	}
	if v, _ := asInt(readPV(runPV)); v != 1 {
		t.Fatalf("expected %s RUNNING(1) after fire, got %v", runPV, readPV(runPV))
	}
	fmt.Printf("PoC after fire:  %s=1 (RUNNING)  %s=1 (RUNNING)\n", seqPV, runPV)

	// After the hold window the timed reset returns both to IDLE(0).
	time.Sleep(sequenceHold + 500*time.Millisecond)
	if v, _ := asInt(readPV(seqPV)); v != 0 {
		t.Fatalf("expected %s IDLE(0) after hold, got %v", seqPV, readPV(seqPV))
	}
	if v, _ := asInt(readPV(runPV)); v != 0 {
		t.Fatalf("expected %s IDLE(0) after hold, got %v", runPV, readPV(runPV))
	}
	fmt.Printf("PoC after hold:  %s=0 (IDLE)     %s=0 (IDLE)\n", seqPV, runPV)
}
