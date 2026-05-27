package main

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
)

func TestRootHandlerServesMockApiOverview(t *testing.T) {
	e := newServer()
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	rec := httptest.NewRecorder()

	e.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d", http.StatusOK, rec.Code)
	}

	contentType := rec.Header().Get("Content-Type")
	if !strings.Contains(contentType, "text/html") {
		t.Fatalf("expected text/html response, got %q", contentType)
	}

	body := rec.Body.String()
	for _, needle := range []string{
		"Mock-up EPICS WebSocket Gateway",
		"/ws/pvs?auth=jwt_token_please",
		"/pv/:name/:value",
		"One simulator per unique PV",
	} {
		if !strings.Contains(body, needle) {
			t.Fatalf("expected response body to contain %q", needle)
		}
	}
}

func TestSimulationHelpersAreSafeUnderConcurrentUse(t *testing.T) {
	const (
		goroutines = 16
		iterations = 500
	)

	prevs := map[string]interface{}{
		"AI_TEST": 12.5,
		"BI_TEST": 1,
		"SI_TEST": "Cooling",
		"PV_TEST": "Ready",
	}

	var wg sync.WaitGroup
	for i := 0; i < goroutines; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for j := 0; j < iterations; j++ {
				for name, prev := range prevs {
					_ = synthValue(name)
					_ = simStepFrom(name, prev)
				}
			}
		}()
	}

	wg.Wait()
}
