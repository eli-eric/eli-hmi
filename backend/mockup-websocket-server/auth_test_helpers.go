package main

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"testing"
	"time"
)

const testJWTSecret = "mockup-test-secret"

func makeBearerToken(t *testing.T, username string) string {
	t.Helper()
	claims := map[string]interface{}{
		"username": username,
		"exp":      time.Now().Add(time.Hour).Unix(),
	}
	signed, err := makeSignedToken(claims, testJWTSecret)
	if err != nil {
		t.Fatalf("failed to sign test jwt: %v", err)
	}
	return "Bearer " + signed
}

func makeSignedToken(claims map[string]interface{}, secret string) (string, error) {
	header := map[string]interface{}{"alg": "HS256", "typ": "JWT"}
	headerBytes, err := json.Marshal(header)
	if err != nil {
		return "", err
	}
	payloadBytes, err := json.Marshal(claims)
	if err != nil {
		return "", err
	}

	encodedHeader := base64.RawURLEncoding.EncodeToString(headerBytes)
	encodedPayload := base64.RawURLEncoding.EncodeToString(payloadBytes)
	unsigned := fmt.Sprintf("%s.%s", encodedHeader, encodedPayload)

	signer := hmac.New(sha256.New, []byte(secret))
	if _, err := signer.Write([]byte(unsigned)); err != nil {
		return "", err
	}
	sig := signer.Sum(nil)

	return unsigned + "." + base64.RawURLEncoding.EncodeToString(sig), nil
}

func setTestAuthHeader(t *testing.T, req *http.Request, username string) {
	t.Helper()
	t.Setenv(jwtSecretEnvVar, testJWTSecret)
	req.Header.Set("Authorization", makeBearerToken(t, username))
}
