package main

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

// postPV fires POST /pv/<name> with the given JSON body and returns the
// recorder. Fails the test on transport-level errors only.
func postPV(t *testing.T, e http.Handler, name, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, "/pv/"+name, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	setTestAuthHeader(t, req, "real-command-tester")
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)
	return rec
}

// TestRealCommandSetAlignmentModePulsesBusy verifies that writing to a real
// SetAlignmentMode command PV (configured in lasers.yaml) pulses its .BUSY
// field — the PV the frontend's sequencerRunning subscribes to — for the hold
// window, then returns it to IDLE.
func TestRealCommandSetAlignmentModePulsesBusy(t *testing.T) {
	e := newServer()
	seedLaserPVs()

	const cmdPV = "L4-OPCPA-NL2:SetAlignmentMode"
	const busyPV = cmdPV + ".BUSY"

	rec := postPV(t, e, cmdPV, `{"value":1}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("fire failed: status %d body %s", rec.Code, rec.Body.String())
	}

	if v, _ := asInt(readPV(busyPV)); v != 1 {
		t.Fatalf("expected %s BUSY(1) after fire, got %v", busyPV, readPV(busyPV))
	}

	time.Sleep(sequenceHold + 500*time.Millisecond)
	if v, _ := asInt(readPV(busyPV)); v != 0 {
		t.Fatalf("expected %s IDLE(0) after hold, got %v", busyPV, readPV(busyPV))
	}
}

// TestRealCommandSetBothChannelsTrigDelayWritesBoth verifies that writing a
// delay to the real SetBothChannelsTrigDelay command PV propagates the value
// to the sibling Ch1/Ch2TriggeringDelay readouts the frontend subscribes to.
func TestRealCommandSetBothChannelsTrigDelayWritesBoth(t *testing.T) {
	e := newServer()
	seedLaserPVs()

	const cmdPV = "L4-OPCPA-NL2:PS5059:22:SetBothChannelsTrigDelay"

	rec := postPV(t, e, cmdPV, `{"value":700}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("write failed: status %d body %s", rec.Code, rec.Body.String())
	}

	for _, ch := range []string{"Ch1TriggeringDelay", "Ch2TriggeringDelay"} {
		pv := "L4-OPCPA-NL2:PS5059:22:" + ch
		if v, _ := asInt(readPV(pv)); v != 700 {
			t.Fatalf("expected %s = 700 after write, got %v", pv, readPV(pv))
		}
	}
}

// TestRealCommandSetBothChannelsTrigDelayRejectsMissingValue mirrors the
// set_delay sequence's contract: a delay write without a value is a 400.
func TestRealCommandSetBothChannelsTrigDelayRejectsMissingValue(t *testing.T) {
	e := newServer()

	rec := postPV(t, e, "L4-OPCPA-NL2:PS5059:22:SetBothChannelsTrigDelay", `{}`)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for missing value, got %d body %s", rec.Code, rec.Body.String())
	}
}
