"""Command vocabulary for the L4 OPCPA page.
Port of `app/(modules)/l4-opcpa/lib/pv-names.ts`.

Read/write *signal* PV names are not built here — they are full strings in the
zone's config (provided by controls). Only **command** PVs are assembled, because
a command maps to a coordinated sequence of writes dispatched by the backend,
not to a single record.
"""

from __future__ import annotations

from dataclasses import dataclass

#: The closed vocabulary. Adding a command means editing this tuple AND wiring a
#: button AND giving the backend a sequence for it.
LASER_COMMANDS: tuple[str, ...] = (
    "START_LASER",
    "STOP_LASER",
    "ALIGNMENT_MODE",
    "SYSTEM_STANDBY",
    "FLASHLAMPS_RUN",
    "FLASHLAMPS_STANDBY",
    "MODBOX_ON",
    "MODBOX_OFF",
    "SET_DELAY",
    "LOAD_WAVEFORM",
)

#: Commands whose written value comes from the operator at press time, so a
#: configured `value` would be silently discarded.
OPERATOR_VALUED_COMMANDS: frozenset[str] = frozenset({"SET_DELAY", "LOAD_WAVEFORM"})


@dataclass(frozen=True)
class CommandTarget:
    """Where a command's write goes and what it writes."""

    pv_name: str
    #: `1` is the trigger convention for backend command PVs; a real device PV
    #: often wants something else (MODBOX_OFF writes the string 'Sleep').
    value: int | str = 1


def command_pv(laser: str, command: str) -> str:
    """`CMD_<laser>_<NAME>` — the backend-sequence trigger."""
    return f"CMD_{laser}_{command}"


def sequence_state_pv(laser: str, command: str) -> str:
    """Per-sequence state PV (1 = RUNNING, 0 = IDLE).

    PROOF OF CONCEPT, carried over verbatim from the React app: the real control
    system does not expose a state PV per sequence yet. The wire name reuses the
    command id so firing `CMD_<laser>_<id>` flips the matching SEQ state PV.
    """
    return f"BI_{laser}_SEQ_{command}"


@dataclass(frozen=True, eq=False)
class CommandResolver:
    """Resolves a command to its write target: the YAML override if there is
    one, else the code-built `CMD_<laser>_<NAME>` triggered with `1`.
    """

    laser: str
    overrides: dict[str, CommandTarget]

    def __call__(self, command: str) -> CommandTarget:
        override = self.overrides.get(command)
        if override is not None:
            return override
        return CommandTarget(pv_name=command_pv(self.laser, command), value=1)
