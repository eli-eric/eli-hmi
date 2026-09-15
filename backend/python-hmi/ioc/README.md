# Local EPICS IOC

A real EPICS IOC serving every PV the L4 OPCPA panel reads, so the HMI can be
run the way it will run in the hall — `EPICS_BACKEND=aioca`, Channel Access,
real records — on a laptop.

This replaces `backend/epics/`, whose database was hand-written against a config
that kept moving: half its records still carried the Go mock's `AI_`/`BI_` names
while the config had gone over to real ones. Here the database is **generated
from the config**, so a PV rename cannot leave the IOC behind.

## Run it

```bash
cd backend/python-hmi
pip install -r ioc/requirements.txt          # pythonSoftIOC: EPICS base as a wheel
python ioc/generate.py                       # db + the `ioc` zone (committed; regenerate after a config edit)
python ioc/run_ioc.py                        # IOC on CA port 5064
```

Then, in another shell:

```bash
ZONE_CODE=ioc EPICS_BACKEND=aioca python -m app     # or: make run-ioc
```

Open <http://localhost:8082>. Nothing is simulated in Python: the numbers move
because `calc` records are scanning, the alarms are real EPICS alarms from real
limit fields, and pressing **Start Laser** runs a `seq` record inside the IOC.

Check it without the HMI:

```bash
python ioc/verify.py        # connects every PV, checks the alarms, presses a command
python ioc/run_ioc.py --list    # every PV the IOC will serve
```

If PVs do not connect, the usual cause is name resolution rather than the IOC:

```bash
export EPICS_CA_ADDR_LIST=127.0.0.1
export EPICS_CA_AUTO_ADDR_LIST=NO
```

## Is this a "real" IOC?

Yes, with one asterisk. `run_ioc.py` loads the database into EPICS base's
iocCore — the same C code a built IOC runs — through the `epicscorelibs` wheel
that [pythonSoftIOC](https://github.com/DiamondLightSource/pythonSoftIOC)
packages. Record processing, scan threads, link semantics, alarm evaluation and
the Channel Access server are all base's. What you do not get is a *built* EPICS
installation, and with it the command-line tools.

For those, `Dockerfile` still builds base 7.0.8 from the bundled tarball (moved
here from `backend/epics`) and runs a stock `softIoc`:

```bash
docker compose -f ioc/docker-compose.yml up --build    # ~10 min the first time
docker exec -it l4-opcpa-ioc caget L4-OPCPA-NL2:FullPower
```

`export-image.sh` / `load-and-run.sh` hand that image to someone who has
neither Python nor EPICS. Host networking is required in both compose files:
Channel Access resolves PV names by UDP broadcast, which Docker's bridge
network does not pass. macOS and Windows have no host network, so use
`run_ioc.py` there.

## What the records simulate

Everything is plain EPICS base — no `sub` records with C, no Python in the loop.
That is the point: if the simulation needed a language the IOC does not have,
the HMI would be talking to something that only resembles a control system.

| Panel element | Records | Behaviour |
| --- | --- | --- |
| Analogue readouts (PHD, temperatures, flows, levels, bias) | `calc` | Random walk inside a band: `MIN(D,MAX(C,A+(RNDM-0.5)*B))` with `INPA` reading the record's own `VAL`, so each scan moves from the last one. Carries `EGU`, `PREC` and real `HIGH`/`HIHI`/`LOW`/`LOLO` limits with `HSV`/`HHSV` severities. |
| Booleans (connection, full power, shutter, MSS, Modbox) | `bi` | Soft input records: they keep whatever the IOC's own sequences write to them. `ZSV` makes a denied MSS permission a MINOR alarm. |
| Enum states (regen, flashlamp channels) | `mbbi` | State names in `ZRST`…, so the panel's `enum_string` read gets `RUN` rather than `1`. |
| Error codes, waveform names | `stringin` | Strings, as the panel expects. |
| Trigger delay, attenuator | `longin` / `longout` | `EGU ns`; the attenuator is written directly by the panel. |
| Commands (`CMD_<laser>_<NAME>`, `SetAlignmentMode`) | `bo` + `seq` | One press, a coordinated set of writes, and a step delayed 3 s that clears the sequencer state — which is why the Sequencer row reads RUNNING and then IDLE. |
| Set All Flashlamps to Run/Standby | `dfanout` | One value to all 14 channels. A `dfanout` has 16 outputs, so this is one record. |
| Set Trigger Delay | `dfanout` | One setpoint to both channels, which is what keeps them equal — the panel flags MISMATCH when they are not. |
| Waveform preset | `fanout` + two `stringout` (`OMSL=closed_loop`) | Applying a preset copies the current one into "Waveform Latest" *first*, then overwrites it. A `seq` cannot do this: its steps carry doubles, not strings. |

### Faults it starts with

The panel's whole job is telling kinds of bad news apart, so the database
injects one of each rather than leaving that to chance:

| Injected | Shows up as |
| --- | --- |
| Chiller 2 outlet temperature runs above its `HIHI` | MAJOR — a real reading the control system is unhappy about, still displayed |
| Chiller 3 water level is never processed | INVALID/UDF — `PV INV`, with the tooltip saying why |
| The last MSS permission is denied, and its record calls that MINOR | The MSS pill reads `NO` in a warning tone |
| One module reports error code `0021` | ERR reads `1/22` instead of `0/22` |
| Two flashlamp channels sit in `STOP` | The tally is not a single column |

They are listed in `INJECTED_FAULTS` in the generator and in the header of the
generated `.db`.

## The two renamed PVs

Two PVs in the `test` zone name a *field* of a record type EPICS base does not
have:

| Config | Record type it needs | Served here as |
| --- | --- | --- |
| `L4-OPCPA-NL2:PortControl.CNCT` | asynRecord (`asyn`) | `L4-OPCPA-NL2:PortControl:CNCT` |
| `L4-OPCPA-NL2:SetAlignmentMode.BUSY` | sseqRecord (`calc`/synApps) | `L4-OPCPA-NL2:SetAlignmentMode:BUSY` |

No base-only IOC can serve them under their real names: a record name cannot
contain a dot, because Channel Access splits the name there to find the field.
Reproducing them needs a full EPICS build with synApps.

So `generate.py` writes a second file — `config/zones/ioc.yaml`, identical to
the source zone except for those two names — and you run the HMI with
`ZONE_CODE=ioc`. That is exactly what the zone mechanism is for, the rewrite is
mechanical rather than hand-edited, and `tests/test_ioc_db.py` asserts nothing
else differs.

## Files

```
generate.py       config -> db + the `ioc` zone. Run after editing a zone.
run_ioc.py        runs the db as an IOC from a pip install (no EPICS build)
verify.py         CA smoke test: connections, alarms, a write, a command
db/l4-opcpa.db    generated; committed so it can be read and diffed
st.cmd            for a stock `softIoc` binary
Dockerfile        builds EPICS base 7.0.8 and runs `softIoc` (adds caget/caput)
docker-compose.yml        build and run the IOC container
docker-compose.image.yml  run a pre-built image instead
export-image.sh / load-and-run.sh   hand that image to a colleague
base-7.0.8.tar.gz         EPICS base source, for the Dockerfile
```

## Adding a laser or renaming a PV

Edit the zone YAML, then:

```bash
python ioc/generate.py --zone test    # or --zone demo for the 3-laser grid
make test                              # test_ioc_db.py fails if the db is stale
```

A PV that several lasers read — a site-wide MSS interlock, say — is emitted once
and read by all of them. Asking for the same name with a *different* definition
fails loudly instead, because `dbLoadRecords` would otherwise keep whichever
came last and the IOC would serve a record nobody meant.
