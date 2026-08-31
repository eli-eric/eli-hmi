// File: gateway.go
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"math/rand"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"
)

/* ----------------------------- payloads ---------------------------------- */

// wsRequest is a batch-protocol frame from the frontend. The shape mirrors
// the real gateway's contract (backend/python-websocket-server/
// api_contract.py) — one subscription_id covers a whole list of PVs, and
// `detail` picks how much metadata each snapshot/event carries.
type wsRequest struct {
	Type           string      `json:"type"` // "subscribe" | "unsubscribe" | "ping"
	SubscriptionID string      `json:"subscription_id"`
	PVs            []string    `json:"pvs"`
	Detail         string      `json:"detail"` // "value" | "time" | "control"; empty = "value"
	Nonce          interface{} `json:"nonce"`
}

const (
	detailValue   = "value"
	detailTime    = "time"
	detailControl = "control"
)

// Gateway parity (app_settings.py defaults); the frontend chunks its
// subscriptions at 64 PVs to stay under the same limit.
const (
	maxPVsPerSubscription         = 64
	maxSubscriptionsPerConnection = 32
)

// ResponseMessage is the REST /pv/:name response shape (the WS stream speaks
// the gateway's snapshot/event format instead — see pvSim.encodeLocked).
type ResponseMessage struct {
	Type      string      `json:"type"` // always "pv"
	Name      string      `json:"name"`
	Value     interface{} `json:"value"`
	Severity  int         `json:"severity"`
	OK        bool        `json:"ok"`
	Timestamp float64     `json:"timestamp"`
	Units     string      `json:"units"`
	Error     string      `json:"error"`
}

type SetPvResponseMessage struct {
	OK    bool   `json:"ok"`
	Error string `json:"error,omitempty"`
}

type SetPvrequestBody struct {
	Type  string      `json:"type"`
	Value interface{} `json:"value"`
}

/* --------------------------- globals ------------------------------------- */

var (
	aiMode       = 1 // 1 = autosimulate, 2 = manual
	biMode       = 2 // 1 = autosimulate, 2 = manual
	siMode       = 2 // 1 = autosimulate, 2 = manual
	severityMode = 1 // 1 = autosimulate severity episodes, 2 = off (always NONE)
	upgrader = websocket.Upgrader{CheckOrigin: func(r *http.Request) bool { return true }}

	// Update period in milliseconds
	updatePeriodMs = 300

	// Random words for PV string mode
	randomWords = []string{"High Vacuum Pumping", "High Vacuum", "Cooling", "Low Temp", "Default", "Rough Vacuum"}

	// pvRegistry: pvName -> *pvSim
	pvRegistry   = make(map[string]*pvSim)
	pvRegistryMu sync.Mutex
)

/* --------------------------- main ---------------------------------------- */

func main() {
	e := newServer()
	seedLaserPVs()

	addr := ":8080"
	log.Println("Sim gateway listening on", addr)
	e.Logger.Fatal(e.Start(addr))
}

func newServer() *echo.Echo {
	e := echo.New()
	e.Use(middleware.Logger(), middleware.Recover())

	// Add CORS middleware
	e.Use(middleware.CORSWithConfig(middleware.CORSConfig{
		AllowOrigins: []string{"*"},
		AllowMethods: []string{http.MethodGet, http.MethodPut, http.MethodPost, http.MethodDelete, http.MethodOptions},
		AllowHeaders: []string{echo.HeaderOrigin, echo.HeaderContentType, echo.HeaderAccept, echo.HeaderAuthorization},
	}))
	e.Use(mutationActorMiddleware)

	e.GET("/", rootHandler)
	e.GET("/ws/pvs", wsHandler) // main ws route
	e.PUT("/pv/:name", setRealLikePVHandler)

	// using GET for set methods to be able to easily set everything from the browser
	e.GET("/pv/:name/:value", setPvHandler)       // manual setter
	e.GET("/mode/:name/:value", setPvModeHandler) // mode switcher

	// L4 OPCPA additions
	e.POST("/pv/:name", writePvHandler) // primary write endpoint: every action is a PV write
	e.GET("/waveforms", listWaveformsHandler)
	e.GET("/mode/fail-rate/:n", setFailRateHandler) // 0 disables; default 10 → 10%

	return e
}

/* ---------------------- severity episode simulation ----------------------- */

// Sticky severity episodes: a PV normally sits at NONE (0); each tick it has
// a small chance to enter a MINOR/MAJOR/INVALID episode that holds for a
// random 5–15 s and then returns to NONE. Decoupled from the value autosim
// modes so BI_/SI_ PVs (manual values by default) still exercise the
// frontend's severity styling.
const (
	sevChanceMinor   = 0.010 // per tick
	sevChanceMajor   = 0.003
	sevChanceInvalid = 0.001
	sevEpisodeMin    = 5 * time.Second
	sevEpisodeMax    = 15 * time.Second
)

type severityState struct {
	severity int       // EPICS severity: 0 NONE, 1 MINOR, 2 MAJOR, 3 INVALID
	until    time.Time // episode end; zero when severity == 0
}

// stepSeverity advances the episode state machine by one tick. `rnd` must
// return uniform [0,1) values (rand.Float64 in production, seeded in tests).
func stepSeverity(s severityState, now time.Time, rnd func() float64) severityState {
	if s.severity != 0 {
		if now.After(s.until) {
			return severityState{}
		}
		return s
	}
	roll := rnd()
	var sev int
	switch {
	case roll < sevChanceInvalid:
		sev = 3
	case roll < sevChanceInvalid+sevChanceMajor:
		sev = 2
	case roll < sevChanceInvalid+sevChanceMajor+sevChanceMinor:
		sev = 1
	default:
		return severityState{}
	}
	dur := sevEpisodeMin + time.Duration(rnd()*float64(sevEpisodeMax-sevEpisodeMin))
	return severityState{severity: sev, until: now.Add(dur)}
}

/* ---------------------- per-PV simulator --------------------------------- */

type pvSim struct {
	name      string
	value     interface{}
	errorMsg  string
	sev       severityState
	subs      map[*wsSub]struct{}
	mu        sync.Mutex
	cancel    context.CancelFunc
	holdUntil time.Time // when set in the future, the autosim loop pauses until this passes
}

func newPVSim(name string) *pvSim {
	ctx, cancel := context.WithCancel(context.Background())
	ps := &pvSim{
		name:   name,
		value:  synthValue(name),
		subs:   make(map[*wsSub]struct{}),
		cancel: cancel,
	}
	go ps.loop(ctx)
	return ps
}

func (ps *pvSim) loop(ctx context.Context) {
	ticker := time.NewTicker(time.Duration(updatePeriodMs) * time.Millisecond)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			now := time.Now()
			ps.mu.Lock()
			// Both severity episodes and value drift pause during a hold
			// (set after sequencer writes) so transitions stay clean.
			hold := !ps.holdUntil.IsZero() && now.Before(ps.holdUntil)
			changed := false
			if !hold && severityMode == 1 {
				if next := stepSeverity(ps.sev, now, rand.Float64); next != ps.sev {
					ps.sev = next
					changed = true
				}
			}
			if !hold && ps.valueAutosim() {
				ps.value = simStepFrom(ps.name, ps.value)
				changed = true
			}
			if changed {
				ps.broadcastLocked("event")
			}
			ps.mu.Unlock()
		case <-ctx.Done():
			return
		}
	}
}

// valueAutosim checks the global per-type value-drift mode flags.
func (ps *pvSim) valueAutosim() bool {
	switch {
	case strings.HasPrefix(ps.name, "CMD_"):
		// Command PVs are write-only triggers (subscribers see only the
		// last-fired value). Never autosim — drift would produce phantom
		// firings on the frontend.
		return false
	case strings.HasPrefix(ps.name, "AI_"):
		return aiMode == 1
	case strings.HasPrefix(ps.name, "BI_"):
		return biMode == 1
	case strings.HasPrefix(ps.name, "SI_"):
		return siMode == 1
	case strings.HasPrefix(ps.name, "PV_"):
		return siMode == 1
	default:
		return true
	}
}

// encodeLocked builds one gateway-shaped snapshot/event frame for `sub`
// (its subscription_id + detail level). Assumes ps.mu is held.
func (ps *pvSim) encodeLocked(event string, sub *wsSub) []byte {
	resp := map[string]interface{}{
		"type":            event,
		"operation":       "monitor",
		"subscription_id": sub.subscriptionID,
		"pv":              ps.name,
		"detail":          sub.detail,
	}
	if ps.errorMsg != "" {
		resp["ok"] = false
		resp["error"] = map[string]interface{}{"code": nil, "message": ps.errorMsg}
	} else {
		resp["ok"] = true
		resp["value"] = ps.value
		metadata := map[string]interface{}{}
		if sub.detail == detailTime || sub.detail == detailControl {
			metadata["status"] = 0
			metadata["severity"] = ps.sev.severity
			metadata["timestamp"] = float64(time.Now().UnixNano()) / 1e9
		}
		if sub.detail == detailControl {
			if u := unitsFor(ps.name); u != "" {
				metadata["units"] = u
			}
		}
		resp["metadata"] = metadata
	}
	b, _ := json.Marshal(resp)
	return b
}

// broadcastLocked fans one frame out to every subscription, each encoded at
// its own detail level. Assumes ps.mu is held.
func (ps *pvSim) broadcastLocked(event string) {
	for sub := range ps.subs {
		b := ps.encodeLocked(event, sub)
		select {
		case sub.cl.writeCh <- b:
		default:
		}
	}
}

func (ps *pvSim) add(sub *wsSub) {
	ps.mu.Lock()
	ps.subs[sub] = struct{}{}
	b := ps.encodeLocked("snapshot", sub) // send current value immediately
	ps.mu.Unlock()

	// non-blocking send
	select {
	case sub.cl.writeCh <- b:
	default:
	}
}

func (ps *pvSim) remove(sub *wsSub) {
	ps.mu.Lock()
	delete(ps.subs, sub)
	empty := len(ps.subs) == 0
	ps.mu.Unlock()

	if empty {
		ps.cancel()
		pvRegistryMu.Lock()
		delete(pvRegistry, ps.name)
		pvRegistryMu.Unlock()
	}
}

func (ps *pvSim) setManualValue(v interface{}, errorMsg string) {
	ps.setManualValueHeld(v, errorMsg, 0)
}

// setManualValueHeld is like setManualValue but additionally pauses the autosim
// loop for `hold` from now. A zero hold leaves the existing holdUntil untouched.
func (ps *pvSim) setManualValueHeld(v interface{}, errorMsg string, hold time.Duration) {
	ps.mu.Lock()
	ps.value = v
	ps.errorMsg = errorMsg
	if hold > 0 {
		ps.holdUntil = time.Now().Add(hold)
	}
	ps.broadcastLocked("event")
	ps.mu.Unlock()
}

/* ---------------------- per-connection state ----------------------------- */

// wsSub is one subscription group — one batch subscribe frame. Every
// snapshot/event for its PVs is tagged with its subscription_id and encoded
// at its detail level. A PV watched by two groups gets one frame per group,
// same as the real gateway.
type wsSub struct {
	cl             *client
	subscriptionID string
	detail         string
	pvs            map[string]*pvSim
}

type client struct {
	writeCh   chan []byte
	groups    map[string]*wsSub // subscription_id -> group; reader-goroutine only
	username  string
	clientKey string
}

// sendJSON marshals and queues one control frame, dropping it if the write
// buffer is full (same non-blocking policy as PV broadcasts).
func (cl *client) sendJSON(v interface{}) {
	b, err := json.Marshal(v)
	if err != nil {
		return
	}
	select {
	case cl.writeCh <- b:
	default:
	}
}

// dropGroup detaches subscription `id` from its PV sims. Reports whether the
// group existed.
func (cl *client) dropGroup(id string) bool {
	sub := cl.groups[id]
	if sub == nil {
		return false
	}
	delete(cl.groups, id)
	for _, ps := range sub.pvs {
		ps.remove(sub)
	}
	return true
}

func wsError(subscriptionID, code, message string) map[string]interface{} {
	e := map[string]interface{}{
		"type":      "error",
		"operation": "monitor",
		"error":     map[string]interface{}{"code": code, "message": message},
	}
	if subscriptionID != "" {
		e["subscription_id"] = subscriptionID
	}
	return e
}

/* ------------------------ WebSocket handler ------------------------------ */

const errorWsUnathorized = "error: unathorized ws connection request"

func wsHandler(c echo.Context) error {
	actor, err := usernameFromWSAuth(c.Request().Header.Get(echo.HeaderAuthorization), c.QueryParam("auth"))
	if err != nil {
		log.Printf("%s: %v", errorWsUnathorized, err)
		return c.String(http.StatusUnauthorized, errorWsUnathorized)
	}

	conn, err := upgrader.Upgrade(c.Response(), c.Request(), nil)
	if err != nil {
		return err
	}
	defer conn.Close()

	_, cancelSocket := context.WithCancel(context.Background())
	defer cancelSocket()

	clientKey := c.Request().Header.Get("Sec-Websocket-Key")

	cl := &client{
		writeCh:   make(chan []byte, 32),
		groups:    make(map[string]*wsSub),
		username:  actor,
		clientKey: clientKey,
	}
	log.Printf("ws client connected actor=%s clientKey=%s", cl.username, cl.clientKey)

	var wg sync.WaitGroup

	/* writer */
	wg.Add(1)
	go func() {
		defer wg.Done()
		for msg := range cl.writeCh {
			if err := conn.WriteMessage(websocket.TextMessage, msg); err != nil {
				cancelSocket()
				return
			}
		}
	}()

	// Gateway parity: greet with connection metadata + limits.
	cl.sendJSON(map[string]interface{}{
		"type":          "connected",
		"operation":     "monitor",
		"connection_id": clientKey,
		"limits": map[string]interface{}{
			"max_pvs_per_subscription":         maxPVsPerSubscription,
			"max_subscriptions_per_connection": maxSubscriptionsPerConnection,
		},
	})

	/* reader */
	for {
		_, raw, err := conn.ReadMessage()
		if err != nil {
			break
		}
		var req wsRequest
		if err := json.Unmarshal(raw, &req); err != nil {
			cl.sendJSON(wsError("", "invalid_message", "malformed message frame"))
			continue
		}

		switch req.Type {
		case "subscribe":
			handleSubscribe(cl, req)
		case "unsubscribe":
			removed := cl.dropGroup(strings.TrimSpace(req.SubscriptionID))
			cl.sendJSON(map[string]interface{}{
				"type":            "unsubscribed",
				"operation":       "monitor",
				"subscription_id": req.SubscriptionID,
				"ok":              removed,
			})
		case "ping":
			cl.sendJSON(map[string]interface{}{
				"type":      "pong",
				"operation": "monitor",
				"nonce":     req.Nonce,
			})
		default:
			cl.sendJSON(wsError(req.SubscriptionID, "invalid_message",
				fmt.Sprintf("unknown message type %q", req.Type)))
		}
	}

	/* teardown */
	for id := range cl.groups {
		cl.dropGroup(id)
	}
	close(cl.writeCh)
	wg.Wait()
	return nil
}

func handleSubscribe(cl *client, req wsRequest) {
	id := strings.TrimSpace(req.SubscriptionID)
	detail := req.Detail
	if detail == "" {
		detail = detailValue
	}
	pvs := make([]string, 0, len(req.PVs))
	for _, name := range req.PVs {
		if n := strings.TrimSpace(name); n != "" {
			pvs = append(pvs, n)
		}
	}

	switch {
	case id == "":
		cl.sendJSON(wsError(id, "invalid_message", "subscription_id is required"))
		return
	case len(pvs) == 0:
		cl.sendJSON(wsError(id, "invalid_message", "pvs must be a non-empty list of PV names"))
		return
	case len(pvs) > maxPVsPerSubscription:
		cl.sendJSON(wsError(id, "too_many_pvs",
			fmt.Sprintf("A subscription can monitor at most %d PVs", maxPVsPerSubscription)))
		return
	case detail != detailValue && detail != detailTime && detail != detailControl:
		cl.sendJSON(wsError(id, "invalid_message", "detail must be one of: value, time, control"))
		return
	}
	if _, exists := cl.groups[id]; !exists && len(cl.groups) >= maxSubscriptionsPerConnection {
		cl.sendJSON(wsError(id, "too_many_subscriptions",
			fmt.Sprintf("A connection can hold at most %d subscriptions", maxSubscriptionsPerConnection)))
		return
	}

	// Re-subscribing an existing id replaces it (gateway parity: implicit
	// unsubscribe, no `unsubscribed` ack).
	cl.dropGroup(id)

	sub := &wsSub{
		cl:             cl,
		subscriptionID: id,
		detail:         detail,
		pvs:            make(map[string]*pvSim, len(pvs)),
	}
	cl.groups[id] = sub

	cl.sendJSON(map[string]interface{}{
		"type":            "subscribed",
		"operation":       "monitor",
		"subscription_id": id,
		"detail":          detail,
		"pvs":             pvs,
		"ok":              true,
	})

	for _, name := range pvs {
		if sub.pvs[name] != nil {
			continue
		}
		ps := getOrCreateSim(name)
		sub.pvs[name] = ps
		ps.add(sub) // emits the initial snapshot
	}
}

/* --------------------- simulate real-like set PV value ------------------- */

func setRealLikePVHandler(c echo.Context) error {
	actor, err := actorFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]interface{}{"ok": false, "error": "unauthorized: missing actor"})
	}

	name := strings.TrimSpace(c.Param("name"))

	if name == "" {
		return c.String(http.StatusBadRequest, "empty pv name")
	}

	requestBody := new(SetPvrequestBody)

	if err := c.Bind(requestBody); err == nil {

		log.Printf("actor=%s pv write %s body=%+v", actor, name, requestBody)

		// simulate random waiting time
		time.Sleep(time.Duration(rand.Intn(3000)) * time.Millisecond)

		//randomly simulate error
		errOccures := rand.Intn(5) == 1

		if errOccures {
			log.Printf("actor=%s pv write %s simulated real-like failure", actor, name)
			return c.JSON(200, SetPvResponseMessage{OK: false, Error: "Some error on EPICS..."})
		}
		log.Printf("actor=%s pv write %s real-like set ok", actor, name)

		return c.JSON(200, SetPvResponseMessage{OK: true})
	}

	return echo.ErrInternalServerError

}

/* ----------------------- manual set endpoint ----------------------------- */

func setPvHandler(c echo.Context) error {
	actor, actorErr := actorFromContext(c)
	if actorErr != nil {
		return c.JSON(http.StatusUnauthorized, map[string]interface{}{"ok": false, "error": "unauthorized: missing actor"})
	}

	name := strings.TrimSpace(c.Param("name"))
	rawVal := strings.TrimSpace(c.Param("value"))
	errorMsg := c.QueryParam("error")

	if name == "" {
		return c.String(http.StatusBadRequest, "empty pv name")
	}

	var val interface{}
	var err error
	switch {
	case strings.HasPrefix(name, "BI_"):
		val, err = strconv.Atoi(rawVal)
		if err != nil {
			return c.String(http.StatusBadRequest, "bool expected for BI_")
		}
	case strings.HasPrefix(name, "SI_"):
		// For PVs, just use the raw string value
		val = rawVal
	default: // treat as AI_ / number
		val, err = strconv.ParseFloat(rawVal, 64)
		if err != nil {
			return c.String(http.StatusBadRequest, "number expected")
		}
	}

	ps := getOrCreateSim(name)
	ps.setManualValue(val, errorMsg)

	if errorMsg != "" {
		log.Printf("actor=%s pv write %s error=%s", actor, name, errorMsg)
		return c.JSON(http.StatusOK, ResponseMessage{
			Type:      "pv",
			Name:      name,
			Value:     nil,
			Severity:  0,
			OK:        false,
			Timestamp: float64(time.Now().UnixNano()) / 1e9,
			Error:     errorMsg,
		})
	}
	log.Printf("actor=%s pv write %s = %v", actor, name, val)

	return c.JSON(http.StatusOK, ResponseMessage{
		Type:      "pv",
		Name:      name,
		Value:     val,
		Severity:  0,
		OK:        true,
		Timestamp: float64(time.Now().UnixNano()) / 1e9,
		Units:     unitsFor(name),
	})
}

/* --------------------------switch simulation/manual mode------------------ */

func setPvModeHandler(c echo.Context) error {
	actor, err := actorFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]interface{}{"ok": false, "error": "unauthorized: missing actor"})
	}

	modeName := c.Param("name")
	modeValue := c.Param("value")

	if modeValueInt, err := strconv.Atoi(modeValue); err == nil {
		switch strings.ToLower(modeName) {
		case "ai":
			aiMode = modeValueInt
		case "bi":
			biMode = modeValueInt
		case "severity":
			// 1 = autosimulate severity episodes, 2 = off (clean demo screen)
			severityMode = modeValueInt
		}
	} else {
		return c.JSON(400, "Value param has to be 1 or 2. 1=simulation mode, 2=manual mode. Example: /mode/ai/2")
	}
	log.Printf("actor=%s mode set %s=%s (aiMode=%d biMode=%d severityMode=%d)", actor, strings.ToLower(modeName), modeValue, aiMode, biMode, severityMode)
	return c.JSON(200, map[string]interface{}{"aiMode": aiMode, "biMode": biMode, "severityMode": severityMode})
}

/* ------------------------- helpers --------------------------------------- */

func getOrCreateSim(name string) *pvSim {
	pvRegistryMu.Lock()
	defer pvRegistryMu.Unlock()
	if ps, ok := pvRegistry[name]; ok {
		return ps
	}
	ps := newPVSim(name)
	pvRegistry[name] = ps
	return ps
}

func synthValue(name string) interface{} {
	switch {
	case strings.HasPrefix(name, "AI_"):
		// Use a smaller deviation (1-3 units) to make changes less dramatic
		return 50 + float64(rand.Intn(3)-1) // Changes between -1, 0, +1 added to base value
	case strings.HasPrefix(name, "BI_"):
		return rand.Intn(2)
	case strings.HasPrefix(name, "SI_"):
		return randomWords[rand.Intn(len(randomWords))]
	default:
		// Smaller changes for default numeric values too
		return rand.Float64() * 3 // Limit to 0-3 range
	}
}

// simStepFrom computes the next autosim value as a small drift around `prev`,
// so that values manually written by a sequence stay reactive: after a
// sequence sets PHD to 120, the autosim drifts around 120 instead of snapping
// back to the historical baseline ~50.
func simStepFrom(name string, prev interface{}) interface{} {
	switch {
	case strings.HasPrefix(name, "AI_"):
		// Coerce prev to float64, remembering whether the input was integer.
		var (
			base   float64
			wasInt bool
		)
		switch v := prev.(type) {
		case float64:
			base = v
		case float32:
			base = float64(v)
		case int:
			base = float64(v)
			wasInt = true
		case int64:
			base = float64(v)
			wasInt = true
		default:
			// First simulation tick: fall back to the historical baseline.
			return synthValue(name)
		}
		// Integer-valued readouts (delay, attenuator) should stay integer —
		// otherwise the UI shows 789.6, 790.4, etc. around a setpoint of 790.
		if wasInt || isIntegerPv(name) {
			return int(base)
		}
		// Drift ±0.5 around the current value.
		return base + (rand.Float64()*2-1)*0.5
	case strings.HasPrefix(name, "BI_"):
		// Binary PVs default to manual mode (biMode=2), so this branch is
		// rarely hit; keep prev to avoid flipping when autosim is enabled.
		if v, ok := prev.(int); ok {
			return v
		}
		return rand.Intn(2)
	case strings.HasPrefix(name, "SI_"):
		if s, ok := prev.(string); ok && s != "" {
			return s
		}
		return randomWords[rand.Intn(len(randomWords))]
	default:
		return rand.Float64() * 3
	}
}

// isIntegerPv tags AI_ readouts that should drift as integers (no fractional
// part). Add new patterns here if more integer-valued readouts appear.
func isIntegerPv(name string) bool {
	switch {
	case strings.Contains(name, "_TRIG_DELAY_"):
		return true
	case strings.HasSuffix(name, "_ATT"):
		return true
	}
	return false
}

func unitsFor(name string) string {
	switch {
	case strings.HasPrefix(name, "AI_TEMP"):
		return "°C"
	case strings.HasPrefix(name, "AI_BAR"):
		return "bar"
	case strings.HasPrefix(name, "AI_MBAR"):
		return "mbar"
	case strings.HasPrefix(name, "AI_K"):
		return "K"
	case strings.HasPrefix(name, "AI_RPM"):
		return "RPM"
	default:
		return ""
	}

}
