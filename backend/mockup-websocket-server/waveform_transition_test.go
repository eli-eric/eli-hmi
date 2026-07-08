package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
)

func resetPVRegistryForTest() {
	pvRegistryMu.Lock()
	defer pvRegistryMu.Unlock()
	for _, ps := range pvRegistry {
		ps.cancel()
	}
	pvRegistry = make(map[string]*pvSim)
}

func postWaveformCommand(t *testing.T, e http.Handler, laser string, waveform string) {
	t.Helper()
	body := strings.NewReader(`{"value":"` + waveform + `"}`)
	req := httptest.NewRequest(http.MethodPost, "/pv/CMD_"+laser+"_LOAD_WAVEFORM", body)
	req.Header.Set("Content-Type", "application/json")
	setTestAuthHeader(t, req, "waveform-tester")
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("waveform command failed: status %d body %s", rec.Code, rec.Body.String())
	}

	var payload map[string]interface{}
	if err := json.Unmarshal(rec.Body.Bytes(), &payload); err != nil {
		t.Fatalf("response is not JSON: %v", err)
	}
	if payload["ok"] != true {
		t.Fatalf("expected ok response, got %s", rec.Body.String())
	}
}

func TestLoadWaveformMovesPreviousPresetToLatest(t *testing.T) {
	resetPVRegistryForTest()
	atomic.StoreInt32(&sequenceFailRate, 0)

	e := newServer()
	seedLaserPVs()

	const loadedPV = "SI_NL2_LOADED_WAVEFORM"
	const latestPV = "SI_NL2_LATEST_WAVEFORM"
	setSeed(loadedPV, "std-100ps")
	setSeed(latestPV, "older-setup")

	postWaveformCommand(t, e, "NL2", "narrow-50ps")

	if got := readPV(loadedPV); got != "narrow-50ps" {
		t.Fatalf("expected Waveform Preset %s to become %q, got %v", loadedPV, "narrow-50ps", got)
	}
	if got := readPV(latestPV); got != "std-100ps" {
		t.Fatalf("expected Waveform Latest %s to receive previous preset %q, got %v", latestPV, "std-100ps", got)
	}
}

func TestLoadWaveformTrimsSelectedPresetBeforeWriting(t *testing.T) {
	resetPVRegistryForTest()
	atomic.StoreInt32(&sequenceFailRate, 0)

	e := newServer()
	seedLaserPVs()

	const loadedPV = "SI_NL2_LOADED_WAVEFORM"
	const latestPV = "SI_NL2_LATEST_WAVEFORM"
	setSeed(loadedPV, "std-100ps")
	setSeed(latestPV, "older-setup")

	postWaveformCommand(t, e, "NL2", "  ramp-up  ")

	if got := readPV(loadedPV); got != "ramp-up" {
		t.Fatalf("expected Waveform Preset %s to become trimmed value %q, got %v", loadedPV, "ramp-up", got)
	}
	if got := readPV(latestPV); got != "std-100ps" {
		t.Fatalf("expected Waveform Latest %s to receive previous preset %q, got %v", latestPV, "std-100ps", got)
	}
}

func TestLoadWaveformRejectsMissingWaveformName(t *testing.T) {
	resetPVRegistryForTest()

	_, err := commandPVEffects("CMD_NL2_LOAD_WAVEFORM", "")
	if err == nil || !strings.Contains(err.Error(), "requires a waveform name") {
		t.Fatalf("expected empty waveform name to be rejected, got %v", err)
	}

	_, err = commandPVEffects("CMD_NL2_LOAD_WAVEFORM", 123)
	if err == nil || !strings.Contains(err.Error(), "requires a waveform name") {
		t.Fatalf("expected non-string waveform name to be rejected, got %v", err)
	}
}
