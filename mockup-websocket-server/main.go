// File: gateway.go
package main

import (
	"context"
	"encoding/json"
	"log"
	"math/rand"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"
)

/* ------------------------- JSON payloads ---------------------------------- */

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

/* ------------------------------------------------------------------------- */

var (
	upgrader = websocket.Upgrader{CheckOrigin: func(r *http.Request) bool { return true }}
	rng      = rand.New(rand.NewSource(time.Now().UnixNano()))
)

func main() {
	e := echo.New()
	e.Use(middleware.Logger(), middleware.Recover())
	e.GET("/ws/pvs", wsHandler)

	addr := ":8080"
	log.Println("Sim gateway listening on", addr)
	e.Logger.Fatal(e.Start(addr))
}

func wsHandler(c echo.Context) error {
	conn, err := upgrader.Upgrade(c.Response(), c.Request(), nil)
	if err != nil {
		return err
	}
	defer conn.Close()

	// ---- per-connection state ---------------------------------------------
	ctx, cancelSocket := context.WithCancel(context.Background())
	defer cancelSocket()

	var wg sync.WaitGroup
	writeCh := make(chan []byte)

	// map[PV]cancelFunc — guarded by a tiny mutex
	subs := make(map[string]context.CancelFunc)
	var subMu sync.Mutex

	/* -------- writer goroutine ------------------------------------------- */
	wg.Add(1)
	go func() {
		defer wg.Done()
		for msg := range writeCh {
			if err := conn.WriteMessage(websocket.TextMessage, msg); err != nil {
				log.Println("ws write:", err)
				cancelSocket() // triggers shutdown
				return
			}
		}
	}()

	/* -------- reader loop ------------------------------------------------- */
	for {
		_, raw, err := conn.ReadMessage()
		if err != nil {
			break // socket closed
		}
		var m RequestMessage
		if json.Unmarshal(raw, &m) != nil {
			log.Println("invalid payload")
			continue
		}

		switch m.Type {
		case "subscribe":
			handleSubscribe(ctx, &wg, writeCh, m.PVs, subs, &subMu)
		case "unsubscribe":
			handleUnsubscribe(m.PVs, subs, &subMu)
		default:
			log.Println("unknown type:", m.Type)
		}
	}

	/* -------- teardown ---------------------------------------------------- */
	subMu.Lock()
	for _, cancel := range subs {
		cancel() // stop any remaining PV goroutine
	}
	subMu.Unlock()

	close(writeCh)
	wg.Wait()
	return nil
}

/* ========================== helpers ======================================= */

func handleSubscribe(
	socketCtx context.Context,
	wg *sync.WaitGroup,
	writeCh chan<- []byte,
	pvs []string,
	subs map[string]context.CancelFunc,
	mu *sync.Mutex,
) {
	const period = 200 * time.Millisecond
	for _, rawPV := range pvs {
		pv := strings.TrimSpace(rawPV)
		if pv == "" {
			continue
		}
		mu.Lock()
		if _, already := subs[pv]; already {
			mu.Unlock()
			continue // ignore duplicate subscription
		}
		// new subscription: create a cancellable context for this PV
		ctx, cancelPV := context.WithCancel(socketCtx)
		subs[pv] = cancelPV
		mu.Unlock()

		wg.Add(1)
		go func(name string, cancel context.CancelFunc) {
			defer wg.Done()
			defer cancel() // make sure map entry dies when loop exits

			ticker := time.NewTicker(period)
			defer ticker.Stop()

			for {
				select {
				case t := <-ticker.C:
					msg := ResponseMessage{
						Type:      "pv",
						Name:      name,
						Value:     synthValue(name),
						Severity:  0,
						OK:        true,
						Timestamp: float64(t.UnixNano()) / 1e9,
						Units:     unitsFor(name),
					}
					if b, _ := json.Marshal(msg); b != nil {
						select {
						case writeCh <- b:
						case <-ctx.Done():
							return
						}
					}
				case <-ctx.Done():
					return
				}
			}
		}(pv, cancelPV)
	}
}

func handleUnsubscribe(
	pvs []string,
	subs map[string]context.CancelFunc,
	mu *sync.Mutex,
) {
	for _, rawPV := range pvs {
		pv := strings.TrimSpace(rawPV)
		if pv == "" {
			continue
		}
		mu.Lock()
		if cancel, ok := subs[pv]; ok {
			cancel()         // stop the goroutine
			delete(subs, pv) // forget it
			log.Println("unsubscribed", pv)
		}
		mu.Unlock()
	}
}

/* -------- value + unit synthesis ----------------------------------------- */

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
