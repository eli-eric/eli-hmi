package main

import (
	"encoding/json"
	"fmt"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
)

/* ------------------------------ helpers ---------------------------------- */

// dialTestWS spins a server (legacy dev auth) and dials the PV socket.
func dialTestWS(t *testing.T) *websocket.Conn {
	t.Helper()
	t.Setenv(jwtSecretEnvVar, "")
	t.Setenv(nextAuthSecretEnvVar, "")
	resetPVRegistryForTest()

	e := newServer()
	ts := httptest.NewServer(e)
	t.Cleanup(ts.Close)

	wsURL := "ws" + strings.TrimPrefix(ts.URL, "http") + "/ws/pvs?auth=jwt_token_please"
	conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("ws dial failed: %v", err)
	}
	t.Cleanup(func() { _ = conn.Close() })
	return conn
}

// disableSeveritySim keeps stream assertions deterministic (no surprise
// severity-episode events between the frames a test expects).
func disableSeveritySim(t *testing.T) {
	t.Helper()
	old := severityMode
	severityMode = 2
	t.Cleanup(func() { severityMode = old })
}

func readFrame(t *testing.T, conn *websocket.Conn, timeout time.Duration) map[string]interface{} {
	t.Helper()
	_ = conn.SetReadDeadline(time.Now().Add(timeout))
	_, raw, err := conn.ReadMessage()
	if err != nil {
		t.Fatalf("ws read failed: %v", err)
	}
	var m map[string]interface{}
	if err := json.Unmarshal(raw, &m); err != nil {
		t.Fatalf("ws frame is not JSON: %v (%s)", err, raw)
	}
	return m
}

// readUntil reads frames until pred matches one, failing after `timeout`.
func readUntil(t *testing.T, conn *websocket.Conn, timeout time.Duration, what string, pred func(map[string]interface{}) bool) map[string]interface{} {
	t.Helper()
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		m := readFrame(t, conn, time.Until(deadline))
		if pred(m) {
			return m
		}
	}
	t.Fatalf("did not receive %s within %v", what, timeout)
	return nil
}

func sendJSONFrame(t *testing.T, conn *websocket.Conn, v interface{}) {
	t.Helper()
	if err := conn.WriteJSON(v); err != nil {
		t.Fatalf("ws write failed: %v", err)
	}
}

func metadataOf(t *testing.T, m map[string]interface{}) map[string]interface{} {
	t.Helper()
	meta, ok := m["metadata"].(map[string]interface{})
	if !ok {
		t.Fatalf("frame has no metadata object: %v", m)
	}
	return meta
}

/* ------------------------------- tests ------------------------------------ */

func TestWSGreetsWithConnectedFrame(t *testing.T) {
	conn := dialTestWS(t)

	m := readFrame(t, conn, 2*time.Second)
	if m["type"] != "connected" {
		t.Fatalf("expected first frame type=connected, got %v", m)
	}
	limits, ok := m["limits"].(map[string]interface{})
	if !ok || limits["max_pvs_per_subscription"] != float64(maxPVsPerSubscription) {
		t.Fatalf("expected limits in connected frame, got %v", m)
	}
}

func TestWSBatchSubscribeAckSnapshotAndEvents(t *testing.T) {
	disableSeveritySim(t)
	conn := dialTestWS(t)

	sendJSONFrame(t, conn, map[string]interface{}{
		"type":            "subscribe",
		"subscription_id": "fe-1",
		"pvs":             []string{"AI_WS_TEST"},
		"detail":          "time",
	})

	ack := readUntil(t, conn, 2*time.Second, "subscribed ack", func(m map[string]interface{}) bool {
		return m["type"] == "subscribed"
	})
	if ack["subscription_id"] != "fe-1" || ack["ok"] != true || ack["detail"] != "time" {
		t.Fatalf("bad subscribed ack: %v", ack)
	}

	snap := readUntil(t, conn, 2*time.Second, "snapshot", func(m map[string]interface{}) bool {
		return m["type"] == "snapshot"
	})
	if snap["pv"] != "AI_WS_TEST" || snap["subscription_id"] != "fe-1" || snap["ok"] != true {
		t.Fatalf("bad snapshot: %v", snap)
	}
	meta := metadataOf(t, snap)
	if _, has := meta["severity"]; !has {
		t.Fatalf("detail=time snapshot should carry severity, got %v", meta)
	}
	if _, has := meta["timestamp"]; !has {
		t.Fatalf("detail=time snapshot should carry timestamp, got %v", meta)
	}

	// AI_ PVs autosimulate by default → an event must follow.
	evt := readUntil(t, conn, 3*time.Second, "event", func(m map[string]interface{}) bool {
		return m["type"] == "event" && m["pv"] == "AI_WS_TEST"
	})
	if evt["subscription_id"] != "fe-1" {
		t.Fatalf("event not tagged with the subscription id: %v", evt)
	}
}

func TestWSDetailLevelsShapeMetadata(t *testing.T) {
	disableSeveritySim(t)
	conn := dialTestWS(t)

	subscribeAndSnapshot := func(id, pv, detail string) map[string]interface{} {
		sendJSONFrame(t, conn, map[string]interface{}{
			"type":            "subscribe",
			"subscription_id": id,
			"pvs":             []string{pv},
			"detail":          detail,
		})
		return readUntil(t, conn, 2*time.Second, "snapshot "+id, func(m map[string]interface{}) bool {
			return m["type"] == "snapshot" && m["subscription_id"] == id
		})
	}

	// value: bare — no severity/timestamp/units.
	meta := metadataOf(t, subscribeAndSnapshot("fe-value", "AI_TEMP_WS_A", "value"))
	if _, has := meta["severity"]; has {
		t.Fatalf("detail=value must not carry severity, got %v", meta)
	}

	// time: severity+timestamp but no units (this is what starved Gate.tsx).
	meta = metadataOf(t, subscribeAndSnapshot("fe-time", "AI_TEMP_WS_B", "time"))
	if _, has := meta["severity"]; !has {
		t.Fatalf("detail=time must carry severity, got %v", meta)
	}
	if _, has := meta["units"]; has {
		t.Fatalf("detail=time must not carry units, got %v", meta)
	}

	// control: time fields + units.
	meta = metadataOf(t, subscribeAndSnapshot("fe-ctrl", "AI_TEMP_WS_C", "control"))
	if meta["units"] != "°C" {
		t.Fatalf("detail=control must carry units, got %v", meta)
	}
}

func TestWSUnsubscribeStopsTheStream(t *testing.T) {
	disableSeveritySim(t)
	conn := dialTestWS(t)

	sendJSONFrame(t, conn, map[string]interface{}{
		"type":            "subscribe",
		"subscription_id": "fe-1",
		"pvs":             []string{"AI_WS_STOP"},
		"detail":          "time",
	})
	readUntil(t, conn, 2*time.Second, "snapshot", func(m map[string]interface{}) bool {
		return m["type"] == "snapshot"
	})

	sendJSONFrame(t, conn, map[string]interface{}{
		"type":            "unsubscribe",
		"subscription_id": "fe-1",
	})
	ack := readUntil(t, conn, 2*time.Second, "unsubscribed ack", func(m map[string]interface{}) bool {
		return m["type"] == "unsubscribed"
	})
	if ack["ok"] != true {
		t.Fatalf("expected unsubscribed ok=true, got %v", ack)
	}

	// Removal happens before the ack is queued, so nothing may follow it.
	_ = conn.SetReadDeadline(time.Now().Add(3 * time.Duration(updatePeriodMs) * time.Millisecond))
	if _, raw, err := conn.ReadMessage(); err == nil {
		t.Fatalf("expected silence after unsubscribe, got frame: %s", raw)
	}
}

func TestWSSubscribeValidationErrors(t *testing.T) {
	disableSeveritySim(t)
	conn := dialTestWS(t)

	expectError := func(code string) {
		m := readUntil(t, conn, 2*time.Second, "error "+code, func(m map[string]interface{}) bool {
			return m["type"] == "error"
		})
		e, _ := m["error"].(map[string]interface{})
		if e == nil || e["code"] != code {
			t.Fatalf("expected error code %q, got %v", code, m)
		}
	}

	// 65 PVs → too_many_pvs.
	pvs := make([]string, maxPVsPerSubscription+1)
	for i := range pvs {
		pvs[i] = fmt.Sprintf("AI_WS_MANY_%d", i)
	}
	sendJSONFrame(t, conn, map[string]interface{}{
		"type":            "subscribe",
		"subscription_id": "fe-1",
		"pvs":             pvs,
		"detail":          "time",
	})
	expectError("too_many_pvs")

	// Missing subscription_id → invalid_message.
	sendJSONFrame(t, conn, map[string]interface{}{
		"type": "subscribe",
		"pvs":  []string{"AI_X"},
	})
	expectError("invalid_message")

	// Legacy map-shaped pvs no longer parses → invalid_message (the old
	// server silently dropped such frames; now the client hears about it).
	if err := conn.WriteMessage(websocket.TextMessage, []byte(`{"type":"subscribe","pvs":{"AI_X":true}}`)); err != nil {
		t.Fatalf("ws write failed: %v", err)
	}
	expectError("invalid_message")

	// Non-JSON frame → invalid_message.
	if err := conn.WriteMessage(websocket.TextMessage, []byte("not-json")); err != nil {
		t.Fatalf("ws write failed: %v", err)
	}
	expectError("invalid_message")
}

func TestWSPingPong(t *testing.T) {
	disableSeveritySim(t)
	conn := dialTestWS(t)

	sendJSONFrame(t, conn, map[string]interface{}{"type": "ping", "nonce": "n-1"})
	pong := readUntil(t, conn, 2*time.Second, "pong", func(m map[string]interface{}) bool {
		return m["type"] == "pong"
	})
	if pong["nonce"] != "n-1" {
		t.Fatalf("pong should echo the nonce, got %v", pong)
	}
}

/* ------------------------ severity state machine -------------------------- */

func TestStepSeverityStaysCalmOnHighRolls(t *testing.T) {
	now := time.Now()
	s := stepSeverity(severityState{}, now, func() float64 { return 0.5 })
	if s.severity != 0 {
		t.Fatalf("expected no episode on a high roll, got %+v", s)
	}
}

func TestStepSeverityEntersHoldsAndClearsEpisode(t *testing.T) {
	now := time.Now()
	// Roll below the INVALID threshold → severity 3, held 5–15 s.
	s := stepSeverity(severityState{}, now, func() float64 { return sevChanceInvalid / 2 })
	if s.severity != 3 {
		t.Fatalf("expected INVALID episode, got %+v", s)
	}
	if d := s.until.Sub(now); d < sevEpisodeMin || d > sevEpisodeMax {
		t.Fatalf("episode duration %v outside [%v, %v]", d, sevEpisodeMin, sevEpisodeMax)
	}

	// While the episode holds, low rolls must not re-roll a new severity.
	mid := stepSeverity(s, now.Add(time.Second), func() float64 { return 0.0 })
	if mid != s {
		t.Fatalf("expected episode to hold, got %+v", mid)
	}

	// After `until`, the state returns to NONE.
	done := stepSeverity(s, s.until.Add(time.Millisecond), func() float64 { return 0.5 })
	if done.severity != 0 || !done.until.IsZero() {
		t.Fatalf("expected episode to clear, got %+v", done)
	}
}

func TestStepSeverityThresholdBands(t *testing.T) {
	now := time.Now()
	cases := []struct {
		roll float64
		want int
	}{
		{sevChanceInvalid / 2, 3},
		{sevChanceInvalid + sevChanceMajor/2, 2},
		{sevChanceInvalid + sevChanceMajor + sevChanceMinor/2, 1},
		{sevChanceInvalid + sevChanceMajor + sevChanceMinor + 0.01, 0},
	}
	for _, tc := range cases {
		s := stepSeverity(severityState{}, now, func() float64 { return tc.roll })
		if s.severity != tc.want {
			t.Fatalf("roll %v: expected severity %d, got %+v", tc.roll, tc.want, s)
		}
	}
}
