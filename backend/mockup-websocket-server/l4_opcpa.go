// L4 OPCPA Control System additions: sequence runner, waveform catalog and
// seed values for the 5 lasers (NL1..NL5). The sequence-effect templates use
// `${L}` as a placeholder for the laser id; substituteLaser swaps it in.
//
// PV names mirror the canonical frontend registry at:
//
//	frontend/src/app/(modules)/l4-opcpa/lib/pv-names.ts
//
// Keep these two files in sync — drift = the mock seeds PVs the frontend
// doesn't subscribe to, or vice versa.
//
// Topology constants (mssCount, modboxStateCount, chillerIds, flashlampBoxes)
// mirror frontend/src/app/(modules)/l4-opcpa/components/laser-specs.ts.
//
// Source spec:
//
//	https://eli-eric.atlassian.net/wiki/spaces/CS/pages/2333902150
package main

import (
	"fmt"
	"log"
	"math/rand"
	"net/http"
	"strconv"
	"strings"
	"sync/atomic"
	"time"

	"github.com/labstack/echo/v4"
)

/* ---------------------- L4 OPCPA constants ------------------------------ */

const (
	mssCount         = 6
	modboxStateCount = 5
	flashlampBoxN    = 7 // PS5059:22..28
	sequenceHold     = 3 * time.Second
)

// sequenceFailRate is 1/N: write fails with probability 1/N. Controlled at
// runtime via `GET /mode/fail-rate/<n>` (0 disables, default 0 = off).
// Demos that want to exercise the error UX should opt in:
//
//	curl http://localhost:8080/mode/fail-rate/10   # 10% failures
var sequenceFailRate int32 = 0

var (
	allLasers      = []string{"NL1", "NL2", "NL3", "NL4", "NL5"}
	chillerIds     = []string{"11", "12", "13", "14"}
	flashlampBoxes = []string{"22", "23", "24", "25", "26", "27", "28"}
	moduleErrors   = []string{
		"REGEN",
		"CHILLER_11",
		"CHILLER_12",
		"CHILLER_13",
		"CHILLER_14",
		"FLASHLAMPS",
	}

	waveformCatalog = []string{
		"std-100ps",
		"narrow-50ps",
		"broad-200ps",
		"super-gauss",
		"ramp-up",
	}
)

/* ---------------------- sequence definitions ---------------------------- */

// pvEffect is one (pv, value) write produced by a sequence for a given laser.
type pvEffect struct {
	pv    string
	value interface{}
}

// sequenceFunc produces the set of PV writes for a sequence + laser + value.
// `value` is the body of the POST to the command PV (e.g. delay ns for
// `CMD_<L>_SET_DELAY`, waveform name for `CMD_<L>_LOAD_WAVEFORM`). Sequences
// that take no arg ignore it.
type sequenceFunc func(laser string, value interface{}) ([]pvEffect, error)

func substituteLaser(template, laser string) string {
	return strings.ReplaceAll(template, "${L}", laser)
}

// flatten a list of templates into laser-resolved effects.
func tpls(laser string, effs ...pvEffect) []pvEffect {
	out := make([]pvEffect, len(effs))
	for i, e := range effs {
		out[i] = pvEffect{pv: substituteLaser(e.pv, laser), value: e.value}
	}
	return out
}

// allFlashlampChannels lists all 14 channel-state PV names for the laser.
func allFlashlampChannels(laser string, state string) []pvEffect {
	out := make([]pvEffect, 0, flashlampBoxN*2)
	for _, box := range flashlampBoxes {
		for _, ch := range []string{"1", "2"} {
			out = append(out, pvEffect{
				pv:    fmt.Sprintf("SI_%s_FL_%s_CH%s", laser, box, ch),
				value: state,
			})
		}
	}
	return out
}

var sequences = map[string]sequenceFunc{
	"start_laser": func(laser string, _ interface{}) ([]pvEffect, error) {
		effs := tpls(laser,
			pvEffect{"BI_${L}_CONN", 1},
			pvEffect{"BI_${L}_FULLP", 1},
			pvEffect{"BI_${L}_REGEN_STATE", 1},
			pvEffect{"AI_${L}_TRIG_DELAY_CH1", 790},
			pvEffect{"AI_${L}_TRIG_DELAY_CH2", 790},
			// PHD energy jumps up when running at full power
			pvEffect{"AI_${L}_PHD_MEAN", 120.0},
			pvEffect{"AI_${L}_PHD2_MEAN", 90.0},
			// Regen warms up while running
			pvEffect{"AI_TEMP_${L}_REGEN", 28.0},
		)
		for i := 1; i <= modboxStateCount; i++ {
			effs = append(effs, pvEffect{fmt.Sprintf("BI_%s_MODBOX_%d", laser, i), 1})
		}
		effs = append(effs, allFlashlampChannels(laser, "RUN")...)
		return effs, nil
	},
	"stop_laser": func(laser string, _ interface{}) ([]pvEffect, error) {
		effs := tpls(laser,
			pvEffect{"BI_${L}_FULLP", 0},
			pvEffect{"BI_${L}_REGEN_STATE", 0},
			pvEffect{"BI_${L}_SHUTTER", 0},
			pvEffect{"AI_${L}_PHD_MEAN", 0.0},
			pvEffect{"AI_${L}_PHD2_MEAN", 0.0},
			pvEffect{"AI_TEMP_${L}_REGEN", 22.0},
		)
		for i := 1; i <= modboxStateCount; i++ {
			effs = append(effs, pvEffect{fmt.Sprintf("BI_%s_MODBOX_%d", laser, i), 0})
		}
		effs = append(effs, allFlashlampChannels(laser, "STOP")...)
		return effs, nil
	},
	"alignment_mode": func(laser string, _ interface{}) ([]pvEffect, error) {
		effs := tpls(laser,
			pvEffect{"BI_${L}_REGEN_STATE", 1},
			pvEffect{"BI_${L}_SHUTTER", 0},
			pvEffect{"BI_${L}_FULLP", 0},
			pvEffect{"AI_${L}_TRIG_DELAY_CH1", 50},
			pvEffect{"AI_${L}_TRIG_DELAY_CH2", 50},
			// alignment mode: regen on but flashlamps standby → low energy
			pvEffect{"AI_${L}_PHD_MEAN", 8.0},
			pvEffect{"AI_${L}_PHD2_MEAN", 4.0},
			pvEffect{"AI_TEMP_${L}_REGEN", 25.0},
		)
		effs = append(effs, allFlashlampChannels(laser, "STANDBY")...)
		return effs, nil
	},
	"system_standby": func(laser string, _ interface{}) ([]pvEffect, error) {
		effs := tpls(laser,
			pvEffect{"BI_${L}_REGEN_STATE", 0},
			pvEffect{"BI_${L}_SHUTTER", 0},
			pvEffect{"BI_${L}_FULLP", 0},
			pvEffect{"AI_${L}_TRIG_DELAY_CH1", 50},
			pvEffect{"AI_${L}_TRIG_DELAY_CH2", 50},
			pvEffect{"AI_${L}_PHD_MEAN", 0.0},
			pvEffect{"AI_${L}_PHD2_MEAN", 0.0},
			pvEffect{"AI_TEMP_${L}_REGEN", 22.0},
		)
		for i := 1; i <= modboxStateCount; i++ {
			effs = append(effs, pvEffect{fmt.Sprintf("BI_%s_MODBOX_%d", laser, i), 1})
		}
		effs = append(effs, allFlashlampChannels(laser, "STANDBY")...)
		return effs, nil
	},
	"flashlamps_run": func(laser string, _ interface{}) ([]pvEffect, error) {
		// PHD is driven by the laser-running state (start_laser), not by
		// flashlamps alone — leave it untouched so "Set All Run" after
		// start_laser does not lower the PHD readout.
		return allFlashlampChannels(laser, "RUN"), nil
	},
	"flashlamps_standby": func(laser string, _ interface{}) ([]pvEffect, error) {
		return allFlashlampChannels(laser, "STANDBY"), nil
	},
	"modbox_on": func(laser string, _ interface{}) ([]pvEffect, error) {
		out := make([]pvEffect, 0, modboxStateCount)
		for i := 1; i <= modboxStateCount; i++ {
			out = append(out, pvEffect{fmt.Sprintf("BI_%s_MODBOX_%d", laser, i), 1})
		}
		return out, nil
	},
	"modbox_off": func(laser string, _ interface{}) ([]pvEffect, error) {
		out := make([]pvEffect, 0, modboxStateCount)
		for i := 1; i <= modboxStateCount; i++ {
			out = append(out, pvEffect{fmt.Sprintf("BI_%s_MODBOX_%d", laser, i), 0})
		}
		return out, nil
	},
	"set_delay": func(laser string, value interface{}) ([]pvEffect, error) {
		if value == nil {
			return nil, fmt.Errorf("set_delay requires a numeric value")
		}
		return tpls(laser,
			pvEffect{"AI_${L}_TRIG_DELAY_CH1", value},
			pvEffect{"AI_${L}_TRIG_DELAY_CH2", value},
		), nil
	},
	// Attenuator + Shutter are direct PV writes (`AI_<L>_ATT`, `BI_<L>_SHUTTER`)
	// — no sequence needed, the operator just writes the value/state.
	"load_waveform": func(laser string, value interface{}) ([]pvEffect, error) {
		waveform, ok := value.(string)
		if !ok || strings.TrimSpace(waveform) == "" {
			return nil, fmt.Errorf("load_waveform requires a waveform name")
		}

		// Waveform Preset is the newly selected waveform. Waveform Latest is
		// the preset that was active immediately before this command. This
		// mirrors the UI requirement: changing the waveform pushes the previous
		// preset into the Latest row instead of echoing the new preset there.
		previousPreset := currentPVValue(fmt.Sprintf("SI_%s_LOADED_WAVEFORM", laser))
		return tpls(laser,
			pvEffect{"SI_${L}_LATEST_WAVEFORM", previousPreset},
			pvEffect{"SI_${L}_LOADED_WAVEFORM", strings.TrimSpace(waveform)},
		), nil
	},
}

/* ---------------------- handlers ---------------------------------------- */

type writePvRequest struct {
	Value interface{} `json:"value"`
}

// writePvHandler is the single write endpoint. Every action in the UI is a
// `POST /pv/<NAME>` with body `{value: ...}`. Two flavours:
//
//   - Command PVs (prefix `CMD_<LASER>_<NAME>`): the value is the trigger; the
//     dispatcher looks up the named effect chain in `sequences` and applies it
//     to all affected PVs in addition to setting the command PV itself.
//   - Plain PVs (everything else): a direct manual write, broadcast to
//     subscribed clients over WS.
func writePvHandler(c echo.Context) error {
	actor, err := actorFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]interface{}{
			"ok":    false,
			"error": "unauthorized: missing actor",
		})
	}

	name := strings.TrimSpace(c.Param("name"))
	if name == "" {
		return c.JSON(http.StatusBadRequest, map[string]interface{}{
			"ok":    false,
			"error": "empty pv name",
		})
	}

	var body writePvRequest
	if c.Request().ContentLength > 0 {
		if err := c.Bind(&body); err != nil {
			return c.JSON(http.StatusBadRequest, map[string]interface{}{
				"ok":    false,
				"error": fmt.Sprintf("invalid body: %v", err),
			})
		}
	}

	// Simulated EPICS latency. Top-level math/rand is goroutine-safe and
	// auto-seeded since Go 1.20.
	latencyMs := 200 + rand.Intn(1300)
	time.Sleep(time.Duration(latencyMs) * time.Millisecond)

	// Atomic failure simulation: write rejected, no PVs mutated.
	failRate := int(atomic.LoadInt32(&sequenceFailRate))
	if failRate > 0 && rand.Intn(failRate) == 0 {
		log.Printf("actor=%s pv write %s simulated failure", actor, name)
		return c.JSON(http.StatusOK, map[string]interface{}{
			"ok":    false,
			"error": "simulated EPICS write failure",
		})
	}

	// Command-PV dispatch. CMD_ prefix is reserved for known commands; if the
	// prefix matches but the name doesn't resolve, this is almost certainly a
	// typo (e.g. CMD_NL2_STAART_LASER) — reject rather than silently writing
	// a phantom PV.
	if strings.HasPrefix(name, "CMD_") {
		effects, cmdErr := commandPVEffects(name, body.Value)
		if cmdErr != nil {
			log.Printf("actor=%s pv write %s rejected: %v", actor, name, cmdErr)
			return c.JSON(http.StatusBadRequest, map[string]interface{}{
				"ok":    false,
				"error": cmdErr.Error(),
			})
		}
		for _, e := range effects {
			ps := getOrCreateSim(e.pv)
			ps.setManualValueHeld(e.value, "", sequenceHold)
		}
		// Reflect the command PV itself so subscribers can see it was fired.
		ps := getOrCreateSim(name)
		ps.setManualValueHeld(body.Value, "", sequenceHold)

		// PROOF-OF-CONCEPT: drive the per-sequence + overall Sequencer state.
		// Firing CMD_<laser>_<ID> shows that sequence (and the Sequencer) as
		// RUNNING for the hold window, then returns to IDLE. Real control system
		// has no per-sequence state PV yet — this mocks it for the expanded
		// Sequencer view.
		if rest := strings.TrimPrefix(name, "CMD_"); rest != name {
			if parts := strings.SplitN(rest, "_", 2); len(parts) == 2 && parts[0] != "" {
				seqPv := fmt.Sprintf("BI_%s_SEQ_%s", parts[0], strings.ToUpper(parts[1]))
				runPv := fmt.Sprintf("BI_%s_SEQUENCER_RUNNING", parts[0])
				getOrCreateSim(seqPv).setManualValue(1, "")
				getOrCreateSim(runPv).setManualValue(1, "")
				time.AfterFunc(sequenceHold, func() {
					getOrCreateSim(seqPv).setManualValue(0, "")
					getOrCreateSim(runPv).setManualValue(0, "")
				})
			}
		}

		log.Printf("actor=%s pv write %s = %v -> %d effects", actor, name, body.Value, len(effects))
		return c.JSON(http.StatusOK, map[string]interface{}{
			"ok":      true,
			"effects": len(effects) + 1,
		})
	}

	// Plain PV write.
	ps := getOrCreateSim(name)
	ps.setManualValueHeld(body.Value, "", sequenceHold)
	log.Printf("actor=%s pv write %s = %v", actor, name, body.Value)
	return c.JSON(http.StatusOK, map[string]interface{}{"ok": true})
}

// commandPVEffects expands a CMD_<LASER>_<NAME> PV write into its effect chain.
// Returns an error for malformed names, unknown commands or sequence-arg
// errors so callers can surface a 400 instead of silently writing a phantom PV.
func commandPVEffects(name string, value interface{}) ([]pvEffect, error) {
	rest := strings.TrimPrefix(name, "CMD_")
	parts := strings.SplitN(rest, "_", 2)
	if len(parts) != 2 || parts[0] == "" {
		return nil, fmt.Errorf("malformed command PV %q (expected CMD_<LASER>_<NAME>)", name)
	}
	laser := parts[0]
	if !isKnownLaser(laser) {
		return nil, fmt.Errorf("unknown laser %q (must be one of %v)", laser, allLasers)
	}
	cmdRaw := parts[1]
	cmd := strings.ToLower(cmdRaw)
	seq, ok := sequences[cmd]
	if !ok {
		// Echo the user's casing in the error so a typo like STAART_LASER is
		// recognisable in the response body, while keeping case-insensitive
		// lookup against the canonical lowercased map keys.
		return nil, fmt.Errorf("unknown command %q (no sequence registered)", cmdRaw)
	}
	return seq(laser, value)
}

func currentPVValue(name string) interface{} {
	ps := getOrCreateSim(name)
	ps.mu.Lock()
	defer ps.mu.Unlock()
	return ps.value
}

func isKnownLaser(id string) bool {
	for _, l := range allLasers {
		if l == id {
			return true
		}
	}
	return false
}

func listWaveformsHandler(c echo.Context) error {
	return c.JSON(http.StatusOK, waveformCatalog)
}

// setFailRateHandler exposes `GET /mode/fail-rate/<n>` so demos can disable the
// 10% simulated failure (n=0 disables; otherwise 1/n probability).
func setFailRateHandler(c echo.Context) error {
	actor, err := actorFromContext(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]interface{}{"ok": false, "error": "unauthorized: missing actor"})
	}

	n, err := strconv.Atoi(c.Param("n"))
	if err != nil || n < 0 {
		return c.JSON(http.StatusBadRequest, map[string]interface{}{
			"ok":    false,
			"error": "expected non-negative integer",
		})
	}
	atomic.StoreInt32(&sequenceFailRate, int32(n))
	log.Printf("actor=%s mode set fail-rate=%d", actor, n)
	return c.JSON(http.StatusOK, map[string]interface{}{
		"ok":       true,
		"failRate": n,
	})
}

/* ---------------------- seed -------------------------------------------- */

// seedLaserPVs primes the per-laser PV registry with at-rest defaults so the
// frontend has a stable picture immediately after boot.
// sequencerSeqIDs are the command ids surfaced as individual sequences in the
// expanded Sequencer (PROOF-OF-CONCEPT). They mirror the frontend
// L4_OPCPA_SEQUENCES ids; the per-sequence state PV is BI_<laser>_SEQ_<id>.
var sequencerSeqIDs = []string{
	"START_LASER",
	"STOP_LASER",
	"ALIGNMENT_MODE",
	"SYSTEM_STANDBY",
	"FLASHLAMPS_RUN",
	"FLASHLAMPS_STANDBY",
}

func seedLaserPVs() {
	for _, laser := range allLasers {
		// general
		setSeed(fmt.Sprintf("BI_%s_CONN", laser), 1)
		setSeed(fmt.Sprintf("BI_%s_FULLP", laser), 0)
		setSeed(fmt.Sprintf("BI_%s_SHUTTER", laser), 0)
		setSeed(fmt.Sprintf("AI_%s_PHD_MEAN", laser), 0.0)
		setSeed(fmt.Sprintf("AI_%s_PHD2_MEAN", laser), 0.0)
		// MSS
		for i := 1; i <= mssCount; i++ {
			setSeed(fmt.Sprintf("BI_%s_MSS_%d", laser, i), 1)
		}
		// Module Errors ("0000" = no error, any other status code = error)
		for _, m := range moduleErrors {
			setSeed(fmt.Sprintf("BI_%s_ERR_%s", laser, m), "0000")
		}
		// Regen
		setSeed(fmt.Sprintf("BI_%s_REGEN_STATE", laser), 0)
		setSeed(fmt.Sprintf("AI_TEMP_%s_REGEN", laser), 22.0)
		setSeed(fmt.Sprintf("AI_%s_ATT", laser), 1024)
		// Chillers
		for _, id := range chillerIds {
			setSeed(fmt.Sprintf("AI_%s_CHILLER_%s_FLOW", laser, id), 5.0)
			setSeed(fmt.Sprintf("AI_%s_CHILLER_%s_TEMP", laser, id), 22.0)
			setSeed(fmt.Sprintf("AI_%s_CHILLER_%s_LEVEL", laser, id), 0.9)
		}
		// Flashlamps: SB by default; trigger delay 50
		for _, eff := range allFlashlampChannels(laser, "STANDBY") {
			setSeed(eff.pv, eff.value)
		}
		setSeed(fmt.Sprintf("AI_%s_TRIG_DELAY_CH1", laser), 50)
		setSeed(fmt.Sprintf("AI_%s_TRIG_DELAY_CH2", laser), 50)
		// Modbox
		for i := 1; i <= modboxStateCount; i++ {
			setSeed(fmt.Sprintf("BI_%s_MODBOX_%d", laser, i), 1)
		}
		setSeed(fmt.Sprintf("SI_%s_LOADED_WAVEFORM", laser), "(none)")
		setSeed(fmt.Sprintf("SI_%s_LATEST_WAVEFORM", laser), "(none)")
		// Sequencer (PROOF-OF-CONCEPT): overall + per-sequence state, all IDLE
		// at start. No real per-sequence PV exists yet; these are mocked so the
		// expanded Sequencer can show individual IDLE/RUNNING per the spec.
		setSeed(fmt.Sprintf("BI_%s_SEQUENCER_RUNNING", laser), 0)
		for _, id := range sequencerSeqIDs {
			setSeed(fmt.Sprintf("BI_%s_SEQ_%s", laser, id), 0)
		}
	}
}

func setSeed(pv string, v interface{}) {
	ps := getOrCreateSim(pv)
	ps.setManualValue(v, "")
}
