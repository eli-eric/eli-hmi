package main

import (
	"net/http"
	"net/http/httptest"
	"strings"
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
