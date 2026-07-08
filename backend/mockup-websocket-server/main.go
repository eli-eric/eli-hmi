// File: gateway.go
package main

import (
	"context"
	"encoding/json"
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

type RequestMessage struct {
	Type string                 `json:"type"` // "subscribe" | "unsubscribe"
	PVs  map[string]interface{} `json:"pvs"`
}

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
	aiMode   = 1 // 1 = autosimulate, 2 = manual
	biMode   = 2 // 1 = autosimulate, 2 = manual
	siMode   = 2 // 1 = autosimulate, 2 = manual
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

/* ---------------------- per-PV simulator --------------------------------- */

type pvSim struct {
	name      string
	value     interface{}
	errorMsg  string
	subs      map[*client]struct{}
	mu        sync.Mutex
	cancel    context.CancelFunc
	holdUntil time.Time // when set in the future, the autosim loop pauses until this passes
}

func newPVSim(name string) *pvSim {
	ctx, cancel := context.WithCancel(context.Background())
	ps := &pvSim{
		name:   name,
		value:  synthValue(name),
		subs:   make(map[*client]struct{}),
		cancel: cancel,
	}
	go ps.loop(ctx)
	return ps
}

const period = 400 * time.Millisecond

func (ps *pvSim) loop(ctx context.Context) {
	ticker := time.NewTicker(time.Duration(updatePeriodMs) * time.Millisecond)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			if ps.shouldSimulate() {
				ps.mu.Lock()
				ps.value = simStepFrom(ps.name, ps.value)
				b := ps.encodeLocked()
				for cl := range ps.subs {
					select {
					case cl.writeCh <- b:
					default:
					}
				}
				ps.mu.Unlock()
			}
		case <-ctx.Done():
			return
		}
	}
}

// shouldSimulate checks the global mode flags and the per-PV hold.
func (ps *pvSim) shouldSimulate() bool {
	ps.mu.Lock()
	hold := ps.holdUntil
	ps.mu.Unlock()
	if !hold.IsZero() && time.Now().Before(hold) {
		return false
	}
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

// encodeLocked assumes ps.mu is held.
func (ps *pvSim) encodeLocked() []byte {
	msg := ResponseMessage{
		Type:      "pv",
		Name:      ps.name,
		Value:     ps.value,
		Error:     ps.errorMsg,
		Severity:  0,
		OK:        ps.errorMsg == "",
		Timestamp: float64(time.Now().UnixNano()) / 1e9,
		Units:     unitsFor(ps.name),
	}
	b, _ := json.Marshal(msg)
	return b
}

func (ps *pvSim) add(cl *client) {
	ps.mu.Lock()
	ps.subs[cl] = struct{}{}
	b := ps.encodeLocked() // send current value immediately
	ps.mu.Unlock()

	// non-blocking send
	select {
	case cl.writeCh <- b:
	default:
	}
}

func (ps *pvSim) remove(cl *client) {
	ps.mu.Lock()
	delete(ps.subs, cl)
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
	b := ps.encodeLocked()
	for cl := range ps.subs {
		select {
		case cl.writeCh <- b:
		default:
		}
	}
	ps.mu.Unlock()
}

/* ---------------------- per-connection state ----------------------------- */

type client struct {
	writeCh   chan []byte
	subs      map[string]*pvSim
	username  string
	clientKey string
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
		subs:      make(map[string]*pvSim),
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

	/* reader */
	for {
		_, raw, err := conn.ReadMessage()
		if err != nil {
			break
		}
		var req RequestMessage
		if json.Unmarshal(raw, &req) != nil {
			continue
		}

		switch req.Type {
		case "subscribe":
			for pvName, _ := range req.PVs {
				pv := strings.TrimSpace(pvName)
				if pv == "" || cl.subs[pv] != nil {
					continue
				}
				ps := getOrCreateSim(pv)
				ps.add(cl)
				cl.subs[pv] = ps
			}
		case "unsubscribe":
			for pvName, _ := range req.PVs {
				pv := strings.TrimSpace(pvName)
				if pv == "" {
					continue
				}
				if ps := cl.subs[pv]; ps != nil {
					ps.remove(cl)
					delete(cl.subs, pv)
				}
			}
		}
	}

	/* teardown */
	for pv, ps := range cl.subs {
		ps.remove(cl)
		delete(cl.subs, pv)
	}
	close(cl.writeCh)
	wg.Wait()
	return nil
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
		if strings.ToLower(modeName) == "ai" {
			aiMode = modeValueInt
		} else if strings.ToLower(modeName) == "bi" {
			biMode = modeValueInt
		}
	} else {
		return c.JSON(400, "Value param has to be 1 or 2. 1=simulation mode, 2=manual mode. Example: /mode/ai/2")
	}
	log.Printf("actor=%s mode set %s=%s (aiMode=%d biMode=%d)", actor, strings.ToLower(modeName), modeValue, aiMode, biMode)
	return c.JSON(200, map[string]interface{}{"aiMode": aiMode, "biMode": biMode})
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
