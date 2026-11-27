"""Everything a ModBox has, which is the same on every laser.

So it is the component's and not any zone's: a laser says `modbox: true` and
its `$(P)` (`macros: {P: ...}`), and each name is `<P>:ModBox:<suffix>`. That
covers the panel's Modbox section (`STATE_ROWS`, `READINGS`) and the registers
the laser's ModBox button shows as a register tree in the panel's place
(`SECTIONS`).
"""

from __future__ import annotations

from typing import Any

#: The Modbox section's state rows as (row label, suffix): the list behind the
#: section's pill, counted ON/OFF.
STATE_ROWS: tuple[tuple[str, str], ...] = (
    ("AWG state", "AWG:State"),
    ("RF1 power", "RF1:Power"),
    ("RF2 power", "RF2:Power"),
    ("AOM state", "AOM:State"),
    ("LAS1 state", "LAS1:State"),
    ("YDFA state", "YDFA:State"),
    ("YDFA software key", "YDFA:SoftwareKey"),
)

#: The section's other readings, by the `pvs:` role the rest of the component
#: knows them by (labels, units and rounding are keyed by role), and suffix.
READINGS: dict[str, str] = {
    "loadedWaveform": "PresetWaveformName",
    "latestWaveform": "LastSentWaveformName",
    "modboxMbc1": "MBC1:BiasValue",
    "modboxMbc2": "MBC2:BiasValue",
}


#: Each section and its registers as (suffix, row label, kind), in the order
#: the device is built. The kind is a register's `kind:`: it decides the
#: datatype the register is monitored at.
SECTIONS: tuple[tuple[str, tuple[tuple[str, str, str], ...]], ...] = (
    (
        "Identification",
        (
            ("Product", "Product", "string"),
            ("SN", "Serial Number", "string"),
        )
    ),
    (
        "AWG & YDFA",
        (
            ("AWG:State", "AWG State", "bool"),
            ("AWG:Waveform", "AWG Waveform", "int"),
            ("AWG:PulseWidth", "AWG Pulse Width", "int"),
            ("AWG:PulseAmplitude", "AWG Pulse Amplitude", "int"),
            ("YDFA:Current", "YDFA Current", "float"),
            ("YDFA:State", "YDFA State", "bool"),
            ("YDFA:SoftwareKey", "YDFA Software Key", "bool"),
        ),
    ),
    (
        "MBC1",
        (
            ("MBC1:DitherAmplitude", "MBC1 Dither Amplitude", "int"),
            ("MBC1:RunningMode", "MBC1 Running Mode", "bool"),
            ("MBC1:DitherFrequency", "MBC1 Dither Frequency", "int"),
            ("MBC1:BiasAlarm", "MBC1 Bias Alarm", "int"),
            ("MBC1:TransferLevel", "MBC1 Transfer Level", "float"),
            ("MBC1:BiasValue", "MBC1 Bias Value", "int"),
            ("MBC1:PDGain", "MBC1 Photodiode Gain", "int"),
            ("MBC1:PDPolarity", "MBC1 Photodiode Polarity", "int"),
        )
    ),
    (
        "MBC2",
        (
            ("MBC2:DitherAmplitude", "MBC2 Dither Amplitude", "int"),
            ("MBC2:RunningMode", "MBC2 Running Mode", "bool"),
            ("MBC2:DitherFrequency", "MBC2 Dither Frequency", "int"),
            ("MBC2:BiasAlarm", "MBC2 Bias Alarm", "int"),
            ("MBC2:TransferLevel", "MBC2 Transfer Level", "float"),
            ("MBC2:BiasValue", "MBC2 Bias Value", "int"),
            ("MBC2:PDGain", "MBC2 Photodiode Gain", "int"),
            ("MBC2:PDPolarity", "MBC2 Photodiode Polarity", "int"),
        )
    ),
    (
        "RF & LAS1 & AOM",
        (
            ("RF1:Gain", "RF1 Gain", "int"),
            ("RF1:Power", "RF1 power", "bool"),
            ("RF2:Gain", "RF2 Gain", "int"),
            ("RF2:Power", "RF2 power", "bool"),
            ("LAS1:Temperature", "LAS1 Temperature", "float"),
            ("LAS1:Power", "LAS1 Power", "float"),
            ("LAS1:State", "LAS1 State", "bool"),
            ("AOM:State", "AOM State", "bool"),
        ),
    ),
    (
        "Delaygen",
        (
            ("SCOPE:Config", "SCOPE Config", "enum"),
            ("AOM:Config", "AOM Config", "enum"),
            ("AOM:Delay", "AOM Delay", "float"),
            ("EOM:Config", "EOM Config", "enum"),
            ("EOM:Delay", "EOM Delay", "float"),
            ("SB:Config", "SB Config", "enum"),
            ("SB:Delay", "SB Delay", "float"),
            ("AMP:Config", "AMP Config", "enum"),
            ("AMP:Delay", "AMP Delay", "float"),
        )
    ),
)


def modbox_modules(prefix: str) -> list[dict[str, Any]]:
    """The sections as register-tree modules under one laser's prefix.

    Each register named in full: a section is called what it is about ("AWG &
    YDFA"), not after a device, so a section's label is not part of a name the
    way a laser module's is.
    """
    return [
        {
            "label": label,
            "registers": [
                {"name": suffix, "label": row, "kind": kind, "pv": f"{prefix}:ModBox:{suffix}"}
                for suffix, row, kind in registers
            ],
        }
        for label, registers in SECTIONS
    ]
