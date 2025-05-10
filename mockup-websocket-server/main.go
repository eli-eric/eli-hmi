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
	Type string   `json:"type"` // "subscribe" | "unsubscribe"
	PVs  []string `json:"pvs"`
}

type ResponseMessage struct {
	Type      string      `json:"type"` // always "pv"
	Name      string      `json:"name"`
	Value     interface{} `json:"value"`
	Severity  int         `json:"severity"`
	OK        bool        `json:"ok"`
	Timestamp float64     `json:"timestamp"`
	Units     string      `json:"units"`
}

/* --------------------------- globals ------------------------------------- */

var (
	aiMode   = 1 // 1 = autosimulate, 2 = manual
	biMode   = 1 // 1 = autosimulate, 2 = manual
	upgrader = websocket.Upgrader{CheckOrigin: func(r *http.Request) bool { return true }}
	rng      = rand.New(rand.NewSource(time.Now().UnixNano()))

	// pvRegistry: pvName -> *pvSim
	pvRegistry   = make(map[string]*pvSim)
	pvRegistryMu sync.Mutex
)

/* --------------------------- main ---------------------------------------- */

func main() {
	e := echo.New()
	e.Use(middleware.Logger(), middleware.Recover())

	e.GET("/ws/pvs", wsHandler) // main ws route

	// using GET for set methods to be able to easily set everything from the browser
	e.GET("/pv/:name/:value", setPvHandler)       // manual setter
	e.GET("/mode/:name/:value", setPvModeHandler) // mode switcher

	addr := ":8080"
	log.Println("Sim gateway listening on", addr)
	e.Logger.Fatal(e.Start(addr))
}

/* ---------------------- per-PV simulator --------------------------------- */

type pvSim struct {
	name   string
	value  interface{}
	subs   map[*client]struct{}
	mu     sync.Mutex
	cancel context.CancelFunc
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
	ticker := time.NewTicker(period)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			if ps.shouldSimulate() {
				ps.mu.Lock()
				ps.value = synthValue(ps.name)
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

// shouldSimulate checks the global mode flags.
func (ps *pvSim) shouldSimulate() bool {
	switch {
	case strings.HasPrefix(ps.name, "AI_"):
		return aiMode == 1
	case strings.HasPrefix(ps.name, "BI_"):
		return biMode == 1
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
		Severity:  0,
		OK:        true,
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

func (ps *pvSim) setManualValue(v interface{}) {
	ps.mu.Lock()
	ps.value = v
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
	writeCh chan []byte
	subs    map[string]*pvSim
}

/* ------------------------ WebSocket handler ------------------------------ */

func wsHandler(c echo.Context) error {
	conn, err := upgrader.Upgrade(c.Response(), c.Request(), nil)
	if err != nil {
		return err
	}
	defer conn.Close()

	_, cancelSocket := context.WithCancel(context.Background())
	defer cancelSocket()

	cl := &client{
		writeCh: make(chan []byte, 32),
		subs:    make(map[string]*pvSim),
	}

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
			for _, pvName := range req.PVs {
				pv := strings.TrimSpace(pvName)
				if pv == "" || cl.subs[pv] != nil {
					continue
				}
				ps := getOrCreateSim(pv)
				ps.add(cl)
				cl.subs[pv] = ps
			}
		case "unsubscribe":
			for _, pvName := range req.PVs {
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

/* ----------------------- manual set endpoint ----------------------------- */

func setPvHandler(c echo.Context) error {
	name := strings.TrimSpace(c.Param("name"))
	rawVal := strings.TrimSpace(c.Param("value"))
	if name == "" {
		return c.String(http.StatusBadRequest, "empty pv name")
	}

	var val interface{}
	var err error
	switch {
	case strings.HasPrefix(name, "BI_"):
		val, err = strconv.ParseBool(rawVal)
		if err != nil {
			return c.String(http.StatusBadRequest, "bool expected for BI_")
		}
	default: // treat as AI_ / number
		val, err = strconv.ParseFloat(rawVal, 64)
		if err != nil {
			return c.String(http.StatusBadRequest, "number expected")
		}
	}

	ps := getOrCreateSim(name)
	ps.setManualValue(val)

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
		return 50 + rng.NormFloat64()*5
	case strings.HasPrefix(name, "BI_"):
		return rng.Intn(2) == 0
	default:
		return rng.Float64()
	}
}

func unitsFor(name string) string {
	if strings.HasPrefix(name, "AI_TEMP") {
		return "°C"
	}
	return ""
}
