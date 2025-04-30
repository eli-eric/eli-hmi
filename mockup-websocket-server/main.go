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

// -------- WebSocket payloads -------------------------------------------------

// Subscribe is the message sent by the browser.
// Example:
//
//	{ "type":"subscribe", "pvs":["AI_TEMP", "BI_PUMP_OK"], "interval_ms":500 }
type Subscribe struct {
	Type      string   `json:"type"`        // must be "subscribe"
	PVs       []string `json:"pvs"`         // list of PV names
	IntervalM int      `json:"interval_ms"` // optional; defaults to 1000 ms
}

// PVMessage is broadcast back to the browser.
type PVMessage struct {
	Type      string      `json:"type"` // always "pv"
	Name      string      `json:"name"`
	Value     interface{} `json:"value"` // float64 or bool
	Severity  int         `json:"severity"`
	OK        bool        `json:"ok"`
	Timestamp float64     `json:"timestamp"`
	Units     string      `json:"units"`
}

// ---------------------------------------------------------------------------

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true }, // allow any origin
}

func main() {
	rand.Seed(time.Now().UnixNano())

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

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	var wg sync.WaitGroup

	// one goroutine serialises all writes for this socket
	writeCh := make(chan []byte)
	wg.Add(1)
	go func() {
		defer wg.Done()
		for msg := range writeCh {
			if err := conn.WriteMessage(websocket.TextMessage, msg); err != nil {
				log.Println("ws write:", err)
				return
			}
		}
	}()

	for {
		_, raw, err := conn.ReadMessage()
		if err != nil {
			break // socket closed
		}

		var sub Subscribe
		if json.Unmarshal(raw, &sub) != nil || sub.Type != "subscribe" {
			log.Println("invalid subscribe")
			continue
		}
		period := time.Duration(sub.IntervalM)
		if period <= 0 {
			period = time.Millisecond * 200
		}

		// launch one simulator per PV for this connection
		for _, pv := range sub.PVs {
			pvName := strings.TrimSpace(pv)
			if pvName == "" {
				continue
			}
			wg.Add(1)
			go func() {
				defer wg.Done()
				tick := time.NewTicker(period)
				defer tick.Stop()

				for {
					select {
					case t := <-tick.C:
						msg := PVMessage{
							Type:      "pv",
							Name:      pvName,
							Value:     synthValue(pvName),
							Severity:  0,
							OK:        true,
							Timestamp: float64(t.UnixNano()) / 1e9,
							Units:     unitsFor(pvName),
						}
						b, _ := json.Marshal(msg)
						select {
						case writeCh <- b:
						case <-ctx.Done():
							return
						}
					case <-ctx.Done():
						return
					}
				}
			}()
		}
	}

	// connection closing: stop everything
	cancel()
	close(writeCh)
	wg.Wait()
	return nil
}

// ---- helpers ---------------------------------------------------------------

// AI_*  → float64     ‖   BI_* → bool
func synthValue(name string) interface{} {
	switch {
	case strings.HasPrefix(name, "AI_"):
		// little random walk around 0..100
		return 50 + rand.NormFloat64()*5
	case strings.HasPrefix(name, "BI_"):
		return rand.Intn(2) == 0
	default:
		return rand.Float64() // fallback: generic number
	}
}

func unitsFor(name string) string {
	if strings.HasPrefix(name, "AI_TEMP") {
		return "°C"
	}
	return ""
}
