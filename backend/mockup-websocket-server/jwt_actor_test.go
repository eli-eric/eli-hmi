package main

import (
	"bytes"
	"log"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/gorilla/websocket"
)

type lockedBuffer struct {
	mu  sync.Mutex
	buf bytes.Buffer
}

func (b *lockedBuffer) Write(p []byte) (int, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.buf.Write(p)
}

func (b *lockedBuffer) String() string {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.buf.String()
}

func TestWritePvHandlerRejectsMissingBearerToken(t *testing.T) {
	t.Setenv(jwtSecretEnvVar, testJWTSecret)
	atomic.StoreInt32(&sequenceFailRate, 0)

	e := newServer()
	body := strings.NewReader(`{"value": 42}`)
	req := httptest.NewRequest(http.MethodPost, "/pv/AI_TEMP", body)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected unauthorized status %d, got %d body=%s", http.StatusUnauthorized, rec.Code, rec.Body.String())
	}
}

func TestWritePvHandlerLogsActorFromJWT(t *testing.T) {
	resetPVRegistryForTest()
	t.Setenv(jwtSecretEnvVar, testJWTSecret)
	atomic.StoreInt32(&sequenceFailRate, 0)

	buf := &lockedBuffer{}
	oldOutput := log.Writer()
	oldFlags := log.Flags()
	log.SetOutput(buf)
	log.SetFlags(0)
	defer func() {
		log.SetOutput(oldOutput)
		log.SetFlags(oldFlags)
	}()

	e := newServer()
	body := strings.NewReader(`{"value": 42}`)
	req := httptest.NewRequest(http.MethodPost, "/pv/AI_TEMP", body)
	req.Header.Set("Content-Type", "application/json")
	setTestAuthHeader(t, req, "alice")
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d body=%s", http.StatusOK, rec.Code, rec.Body.String())
	}

	logged := buf.String()
	if !strings.Contains(logged, "actor=alice") {
		t.Fatalf("expected actor in logs, got: %s", logged)
	}
	if !strings.Contains(logged, "pv write AI_TEMP") {
		t.Fatalf("expected pv write in logs, got: %s", logged)
	}
}

func TestWritePvHandlerRejectsTokenWithoutUsernameClaim(t *testing.T) {
	t.Setenv(jwtSecretEnvVar, testJWTSecret)
	atomic.StoreInt32(&sequenceFailRate, 0)

	signed, err := makeSignedToken(map[string]interface{}{
		"exp": time.Now().Add(time.Hour).Unix(),
	}, testJWTSecret)
	if err != nil {
		t.Fatalf("failed signing jwt: %v", err)
	}

	e := newServer()
	body := strings.NewReader(`{"value": 42}`)
	req := httptest.NewRequest(http.MethodPost, "/pv/AI_TEMP", body)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+signed)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected unauthorized status %d, got %d body=%s", http.StatusUnauthorized, rec.Code, rec.Body.String())
	}
}

func TestWebSocketConnectionLogsActor(t *testing.T) {
	t.Setenv(jwtSecretEnvVar, testJWTSecret)

	buf := &lockedBuffer{}
	oldOutput := log.Writer()
	oldFlags := log.Flags()
	log.SetOutput(buf)
	log.SetFlags(0)
	defer func() {
		log.SetOutput(oldOutput)
		log.SetFlags(oldFlags)
	}()

	e := newServer()
	ts := httptest.NewServer(e)
	defer ts.Close()

	wsURL := "ws" + strings.TrimPrefix(ts.URL, "http") + "/ws/pvs"
	headers := http.Header{}
	headers.Set("Authorization", makeBearerToken(t, "ws-alice"))

	conn, _, err := websocket.DefaultDialer.Dial(wsURL, headers)
	if err != nil {
		t.Fatalf("expected ws connection to succeed: %v", err)
	}
	_ = conn.Close()

	if !strings.Contains(buf.String(), "ws client connected actor=ws-alice") {
		t.Fatalf("expected ws actor log entry, got: %s", buf.String())
	}
}

func TestWebSocketConnectionRejectsInvalidJWT(t *testing.T) {
	t.Setenv(jwtSecretEnvVar, testJWTSecret)

	e := newServer()
	ts := httptest.NewServer(e)
	defer ts.Close()

	wsURL := "ws" + strings.TrimPrefix(ts.URL, "http") + "/ws/pvs"
	headers := http.Header{}
	headers.Set("Authorization", "Bearer invalid-token")

	conn, resp, err := websocket.DefaultDialer.Dial(wsURL, headers)
	if conn != nil {
		_ = conn.Close()
	}
	if err == nil {
		t.Fatal("expected ws dial to fail with invalid jwt")
	}
	if resp == nil || resp.StatusCode != http.StatusUnauthorized {
		status := 0
		if resp != nil {
			status = resp.StatusCode
		}
		t.Fatalf("expected unauthorized status %d, got %d", http.StatusUnauthorized, status)
	}
}

func TestWebSocketConnectionAllowsLegacyAuthWhenNoSecretConfigured(t *testing.T) {
	t.Setenv(jwtSecretEnvVar, "")
	t.Setenv(nextAuthSecretEnvVar, "")

	e := newServer()
	ts := httptest.NewServer(e)
	defer ts.Close()

	wsURL := "ws" + strings.TrimPrefix(ts.URL, "http") + "/ws/pvs?auth=jwt_token_please"
	conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("expected ws connection to succeed without secret in dev mode: %v", err)
	}
	_ = conn.Close()
}

func TestWritePvHandlerAcceptsNextAuthSecretFallback(t *testing.T) {
	resetPVRegistryForTest()
	t.Setenv(jwtSecretEnvVar, "")
	t.Setenv(nextAuthSecretEnvVar, testJWTSecret)
	atomic.StoreInt32(&sequenceFailRate, 0)

	e := newServer()
	body := strings.NewReader(`{"value": 42}`)
	req := httptest.NewRequest(http.MethodPost, "/pv/AI_TEMP", body)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", makeBearerToken(t, "fallback-user"))
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status %d with NEXTAUTH_SECRET fallback, got %d body=%s", http.StatusOK, rec.Code, rec.Body.String())
	}
}
