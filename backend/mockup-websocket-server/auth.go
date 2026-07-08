package main

import (
	"crypto/hmac"
	"crypto/sha256"
	"errors"
	"fmt"
	"log"
	"math"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"encoding/base64"
	"encoding/json"

	"github.com/labstack/echo/v4"
)

const (
	jwtSecretEnvVar      = "MOCKUP_JWT_HS256_SECRET"
	nextAuthSecretEnvVar = "NEXTAUTH_SECRET"
	actorContextKey      = "requestActor"
)

var warnNoJWTSecretOnce sync.Once

func mutationActorMiddleware(next echo.HandlerFunc) echo.HandlerFunc {
	return func(c echo.Context) error {
		if !requiresActor(c.Request().Method, c.Request().URL.Path) {
			return next(c)
		}

		actor, err := usernameFromBearerHeader(c.Request().Header.Get(echo.HeaderAuthorization))
		if err != nil {
			return c.JSON(http.StatusUnauthorized, map[string]interface{}{
				"ok":    false,
				"error": "unauthorized: invalid bearer token",
			})
		}

		c.Set(actorContextKey, actor)
		return next(c)
	}
}

func requiresActor(method, path string) bool {
	if strings.HasPrefix(path, "/pv/") {
		switch method {
		case http.MethodPost, http.MethodPut, http.MethodGet:
			return true
		}
	}
	if method == http.MethodGet && strings.HasPrefix(path, "/mode/") {
		return true
	}
	return false
}

func actorFromContext(c echo.Context) (string, error) {
	v := c.Get(actorContextKey)
	actor, ok := v.(string)
	if !ok || strings.TrimSpace(actor) == "" {
		return "", errors.New("missing request actor")
	}
	return actor, nil
}

func usernameFromWSAuth(authHeader, queryAuth string) (string, error) {
	if strings.TrimSpace(authHeader) != "" {
		return usernameFromBearerHeader(authHeader)
	}

	q := strings.TrimSpace(queryAuth)
	if q == "" {
		return "", errors.New("missing websocket auth")
	}
	if strings.HasPrefix(strings.ToLower(q), "bearer ") {
		token, err := parseBearerToken(q)
		if err != nil {
			return "", err
		}
		return usernameFromTokenString(token)
	}

	return usernameFromTokenString(q)
}

func usernameFromBearerHeader(authHeader string) (string, error) {
	tokenString, err := parseBearerToken(authHeader)
	if err != nil {
		return "", err
	}
	return usernameFromTokenString(tokenString)
}

func parseBearerToken(value string) (string, error) {
	authHeader := strings.TrimSpace(value)
	if authHeader == "" {
		return "", errors.New("missing authorization header")
	}

	parts := strings.Fields(authHeader)
	if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
		return "", errors.New("authorization header must be Bearer token")
	}

	tokenString := strings.TrimSpace(parts[1])
	if tokenString == "" {
		return "", errors.New("empty bearer token")
	}
	return tokenString, nil
}

func usernameFromTokenString(tokenString string) (string, error) {
	secret, hasSecret := resolveJWTSecret()
	if !hasSecret {
		warnNoJWTSecretOnce.Do(func() {
			log.Printf("jwt secret envs %s and %s are not set; running in dev compatibility mode (signature not verified)", jwtSecretEnvVar, nextAuthSecretEnvVar)
		})

		claims, err := parseJWTClaimsNoVerify(tokenString)
		if err != nil {
			// Keep local/dev workable for clients still sending legacy opaque auth strings.
			return "unknown", nil
		}
		if actor, ok := actorFromClaims(claims); ok {
			return actor, nil
		}
		return "unknown", nil
	}

	claims, err := parseAndVerifyHS256Token(tokenString, secret)
	if err != nil {
		return "", err
	}

	actor, ok := actorFromClaims(claims)
	if !ok {
		return "", errors.New("missing username claim")
	}

	return actor, nil
}

func resolveJWTSecret() (string, bool) {
	if s := strings.TrimSpace(os.Getenv(jwtSecretEnvVar)); s != "" {
		return s, true
	}
	if s := strings.TrimSpace(os.Getenv(nextAuthSecretEnvVar)); s != "" {
		return s, true
	}
	return "", false
}

func parseJWTClaimsNoVerify(tokenString string) (map[string]interface{}, error) {
	parts := strings.Split(tokenString, ".")
	if len(parts) != 3 {
		return nil, errors.New("jwt must have 3 sections")
	}

	payloadBytes, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return nil, fmt.Errorf("invalid jwt payload encoding: %w", err)
	}
	var claims map[string]interface{}
	if err := json.Unmarshal(payloadBytes, &claims); err != nil {
		return nil, fmt.Errorf("invalid jwt payload json: %w", err)
	}
	return claims, nil
}

func actorFromClaims(claims map[string]interface{}) (string, bool) {
	for _, key := range []string{"username", "preferred_username", "name", "sub"} {
		if raw, ok := claims[key]; ok {
			if s, ok := raw.(string); ok && strings.TrimSpace(s) != "" {
				return strings.TrimSpace(s), true
			}
		}
	}
	return "", false
}

func parseAndVerifyHS256Token(tokenString, secret string) (map[string]interface{}, error) {
	parts := strings.Split(tokenString, ".")
	if len(parts) != 3 {
		return nil, errors.New("jwt must have 3 sections")
	}

	headerBytes, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return nil, fmt.Errorf("invalid jwt header encoding: %w", err)
	}
	var header map[string]interface{}
	if err := json.Unmarshal(headerBytes, &header); err != nil {
		return nil, fmt.Errorf("invalid jwt header json: %w", err)
	}
	algRaw, ok := header["alg"]
	if !ok {
		return nil, errors.New("missing jwt alg")
	}
	alg, ok := algRaw.(string)
	if !ok || alg != "HS256" {
		return nil, fmt.Errorf("unexpected signing method: %v", algRaw)
	}

	sig, err := base64.RawURLEncoding.DecodeString(parts[2])
	if err != nil {
		return nil, fmt.Errorf("invalid jwt signature encoding: %w", err)
	}

	signer := hmac.New(sha256.New, []byte(secret))
	if _, err := signer.Write([]byte(parts[0] + "." + parts[1])); err != nil {
		return nil, fmt.Errorf("failed jwt signature computation: %w", err)
	}
	expectedSig := signer.Sum(nil)
	if !hmac.Equal(sig, expectedSig) {
		return nil, errors.New("jwt signature verification failed")
	}

	payloadBytes, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return nil, fmt.Errorf("invalid jwt payload encoding: %w", err)
	}
	var claims map[string]interface{}
	if err := json.Unmarshal(payloadBytes, &claims); err != nil {
		return nil, fmt.Errorf("invalid jwt payload json: %w", err)
	}

	if expRaw, ok := claims["exp"]; ok {
		expUnix, err := claimToUnix(expRaw)
		if err != nil {
			return nil, fmt.Errorf("invalid exp claim: %w", err)
		}
		if time.Now().Unix() >= expUnix {
			return nil, errors.New("jwt is expired")
		}
	}

	return claims, nil
}

func claimToUnix(v interface{}) (int64, error) {
	switch n := v.(type) {
	case float64:
		if math.IsNaN(n) || math.IsInf(n, 0) {
			return 0, errors.New("exp is not finite")
		}
		return int64(n), nil
	case json.Number:
		i, err := n.Int64()
		if err != nil {
			return 0, err
		}
		return i, nil
	case int64:
		return n, nil
	case int:
		return int64(n), nil
	case string:
		i, err := strconv.ParseInt(strings.TrimSpace(n), 10, 64)
		if err != nil {
			return 0, err
		}
		return i, nil
	default:
		return 0, fmt.Errorf("unsupported exp type %T", v)
	}
}
