package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
)

// testWS is a websocket client with a background reader: a read deadline on a
// gorilla connection poisons it for every later read, so the test drains
// frames from a channel instead of timing out the socket.
type testWS struct {
	conn   *websocket.Conn
	frames chan ResponseMessage
}

func dialTestWS(t *testing.T) *testWS {
	t.Helper()
	t.Setenv(jwtSecretEnvVar, testJWTSecret)

	e := newServer()
	ts := httptest.NewServer(e)
	t.Cleanup(ts.Close)

	headers := http.Header{}
	headers.Set("Authorization", makeBearerToken(t, "sub-tester"))
	conn, _, err := websocket.DefaultDialer.Dial("ws"+strings.TrimPrefix(ts.URL, "http")+"/ws/pvs", headers)
	if err != nil {
		t.Fatalf("ws dial failed: %v", err)
	}
	t.Cleanup(func() { _ = conn.Close() })

	ws := &testWS{conn: conn, frames: make(chan ResponseMessage, 4096)}
	go func() {
		defer close(ws.frames)
		for {
			_, raw, err := conn.ReadMessage()
			if err != nil {
				return
			}
			var msg ResponseMessage
			if err := json.Unmarshal(raw, &msg); err != nil {
				return
			}
			ws.frames <- msg
		}
	}()
	return ws
}

func (ws *testWS) send(t *testing.T, payload interface{}) {
	t.Helper()
	if err := ws.conn.WriteJSON(payload); err != nil {
		t.Fatalf("ws write failed: %v", err)
	}
}

// collect gathers frames for `window` and returns the last value seen per PV.
func (ws *testWS) collect(window time.Duration) map[string]interface{} {
	seen := make(map[string]interface{})
	timeout := time.After(window)
	for {
		select {
		case msg, ok := <-ws.frames:
			if !ok {
				return seen
			}
			seen[msg.Name] = msg.Value
		case <-timeout:
			return seen
		}
	}
}

// collectUntil gathers frames until every PV in want has been seen, or the
// window expires (which fails the test).
func (ws *testWS) collectUntil(t *testing.T, window time.Duration, want []string) map[string]interface{} {
	t.Helper()
	missing := make(map[string]struct{}, len(want))
	for _, pv := range want {
		missing[pv] = struct{}{}
	}
	seen := make(map[string]interface{})
	timeout := time.After(window)
	for len(missing) > 0 {
		select {
		case msg, ok := <-ws.frames:
			if !ok {
				t.Fatalf("connection closed with %d PVs still missing", len(missing))
			}
			seen[msg.Name] = msg.Value
			delete(missing, msg.Name)
		case <-timeout:
			t.Fatalf("timed out with %d of %d PVs never delivered", len(missing), len(want))
		}
	}
	return seen
}

// sync waits until the connection's reader goroutine has processed everything
// sent so far: messages are handled in order, so the snapshot of a freshly
// subscribed sentinel PV proves the earlier messages are done.
// It returns everything collected on the way, so a test can assert that a PV
// it expects to be unsubscribed produced no frame.
func (ws *testWS) sync(t *testing.T, sentinel string) map[string]interface{} {
	t.Helper()
	ws.send(t, map[string]interface{}{
		"type": "subscribe", "subscription_id": "sync-" + sentinel, "pvs": []string{sentinel},
	})
	return ws.collectUntil(t, 2*time.Second, []string{sentinel})
}

func simFor(t *testing.T, name string) *pvSim {
	t.Helper()
	pvRegistryMu.Lock()
	defer pvRegistryMu.Unlock()
	return pvRegistry[name]
}

// A group unsubscribe must not destroy the simulators: the frontend removes a
// single PV by dropping the whole group and re-subscribing the survivors, and
// the seeded values have to survive that round trip.
func TestGroupUnsubscribeKeepsSeededValues(t *testing.T) {
	resetPVRegistryForTest()
	setSeed("BI_SUBTEST_ERR_A", 0)
	setSeed("BI_SUBTEST_ERR_B", 0)
	seededA := simFor(t, "BI_SUBTEST_ERR_A")

	ws := dialTestWS(t)
	ws.send(t, map[string]interface{}{
		"type": "subscribe", "subscription_id": "fe-1",
		"pvs": []string{"BI_SUBTEST_ERR_A", "BI_SUBTEST_ERR_B"},
	})
	ws.collectUntil(t, 2*time.Second, []string{"BI_SUBTEST_ERR_A", "BI_SUBTEST_ERR_B"})

	// Partial removal, exactly as the frontend performs it.
	ws.send(t, map[string]interface{}{"type": "unsubscribe", "subscription_id": "fe-1"})
	ws.send(t, map[string]interface{}{
		"type": "subscribe", "subscription_id": "fe-2", "pvs": []string{"BI_SUBTEST_ERR_A"},
	})

	frames := ws.collectUntil(t, 2*time.Second, []string{"BI_SUBTEST_ERR_A"})
	if got, ok := frames["BI_SUBTEST_ERR_A"]; !ok || got != float64(0) {
		t.Fatalf("expected re-subscribed PV to report its seeded 0, got %v (present=%v)", got, ok)
	}
	if simFor(t, "BI_SUBTEST_ERR_A") != seededA {
		t.Fatal("simulator was destroyed and re-created by the group unsubscribe")
	}
	if simFor(t, "BI_SUBTEST_ERR_B") == nil {
		t.Fatal("unsubscribed simulator was dropped from the registry")
	}
}

// Re-using a subscription_id replaces its membership; PVs dropped from the
// group must stop being delivered instead of leaking for the connection's life.
func TestResubscribeSameIDReleasesDroppedPVs(t *testing.T) {
	resetPVRegistryForTest()
	setSeed("BI_SUBTEST_KEEP", 0)
	setSeed("BI_SUBTEST_DROP", 0)

	ws := dialTestWS(t)
	ws.send(t, map[string]interface{}{
		"type": "subscribe", "subscription_id": "fe-1",
		"pvs": []string{"BI_SUBTEST_KEEP", "BI_SUBTEST_DROP"},
	})
	ws.send(t, map[string]interface{}{
		"type": "subscribe", "subscription_id": "fe-1", "pvs": []string{"BI_SUBTEST_KEEP"},
	})
	ws.sync(t, "BI_SUBTEST_SYNC1")

	// DROP is written first, so a leaked frame for it would arrive before the
	// KEEP frame the collector waits for.
	getOrCreateSim("BI_SUBTEST_DROP").setManualValue(1, "")
	getOrCreateSim("BI_SUBTEST_KEEP").setManualValue(1, "")

	frames := ws.collectUntil(t, 2*time.Second, []string{"BI_SUBTEST_KEEP"})
	if _, leaked := frames["BI_SUBTEST_DROP"]; leaked {
		t.Fatal("PV dropped from the re-subscribed group is still being delivered")
	}
	if frames["BI_SUBTEST_KEEP"] != float64(1) {
		t.Fatalf("expected update for the retained PV, got %v", frames["BI_SUBTEST_KEEP"])
	}
}

// A PV monitored by two groups must survive one of them going away.
func TestPVSharedBetweenGroupsSurvivesOneUnsubscribe(t *testing.T) {
	resetPVRegistryForTest()
	setSeed("BI_SUBTEST_SHARED", 0)

	ws := dialTestWS(t)
	ws.send(t, map[string]interface{}{
		"type": "subscribe", "subscription_id": "fe-1", "pvs": []string{"BI_SUBTEST_SHARED"},
	})
	ws.send(t, map[string]interface{}{
		"type": "subscribe", "subscription_id": "fe-2", "pvs": []string{"BI_SUBTEST_SHARED"},
	})
	ws.send(t, map[string]interface{}{"type": "unsubscribe", "subscription_id": "fe-1"})
	ws.sync(t, "BI_SUBTEST_SYNC2")

	getOrCreateSim("BI_SUBTEST_SHARED").setManualValue(1, "")

	frames := ws.collectUntil(t, 2*time.Second, []string{"BI_SUBTEST_SHARED"})
	if frames["BI_SUBTEST_SHARED"] != float64(1) {
		t.Fatalf("PV still held by fe-2 stopped updating after fe-1 unsubscribed: %v", frames)
	}
}

// The legacy per-PV protocol (map payload, no subscription_id) still works.
func TestLegacyPerPVProtocol(t *testing.T) {
	resetPVRegistryForTest()
	setSeed("BI_SUBTEST_LEGACY", 0)

	ws := dialTestWS(t)
	ws.send(t, map[string]interface{}{
		"type": "subscribe", "pvs": map[string]interface{}{"BI_SUBTEST_LEGACY": true},
	})
	ws.sync(t, "BI_SUBTEST_SYNC3")

	getOrCreateSim("BI_SUBTEST_LEGACY").setManualValue(1, "")
	if frames := ws.collectUntil(t, 2*time.Second, []string{"BI_SUBTEST_LEGACY"}); frames["BI_SUBTEST_LEGACY"] != float64(1) {
		t.Fatalf("legacy subscribe delivered no update: %v", frames)
	}

	ws.send(t, map[string]interface{}{
		"type": "unsubscribe", "pvs": map[string]interface{}{"BI_SUBTEST_LEGACY": true},
	})
	ws.sync(t, "BI_SUBTEST_SYNC4")

	getOrCreateSim("BI_SUBTEST_LEGACY").setManualValue(0, "")
	if frames := ws.sync(t, "BI_SUBTEST_SYNC5"); len(frames) != 1 {
		t.Fatalf("legacy unsubscribe left the PV subscribed: %v", frames)
	}
}

// Every snapshot of a large batch must arrive — the old 32-slot channel with a
// non-blocking send silently dropped the tail.
func TestLargeBatchDeliversEverySnapshot(t *testing.T) {
	resetPVRegistryForTest()

	const count = 300
	pvs := make([]string, 0, count)
	for i := 0; i < count; i++ {
		name := fmt.Sprintf("BI_SUBTEST_BATCH_%03d", i)
		setSeed(name, 0)
		pvs = append(pvs, name)
	}

	ws := dialTestWS(t)
	ws.send(t, map[string]interface{}{
		"type": "subscribe", "subscription_id": "fe-1", "pvs": pvs,
	})

	ws.collectUntil(t, 5*time.Second, pvs)
}
