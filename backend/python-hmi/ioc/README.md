# Local EPICS IOC

A real EPICS IOC serving every PV a zone's screens read, so the HMI can be run
the way it will run in the hall — `EPICS_BACKEND=aioca`, Channel Access, real
records — on a laptop.

**The database is generated from what the components declare**, not written by
hand. Every component says what each of its PVs is (`Component.pv_specs()`), and
`generate.py` turns those declarations into records. So a screen written purely
in YAML gets a working IOC with no extra work, and a PV rename cannot leave the
IOC behind. That is the failure the old `backend/epics` suffered: half its
records still carried the Go mock's `AI_`/`BI_` names while the config had gone
over to real ones.

## Run it

```bash
cd backend/python-hmi
uv sync --extra epics --extra ioc            # pythonSoftIOC: EPICS base as a wheel
uv run python ioc/generate.py                # db + the TESTZ-IOC zone
make ioc                                     # the IOC, on CA port 5064
```

Then, in another shell:

```bash
make run-ioc                                 # the HMI against it
```

Open <http://localhost:8082>. Nothing is simulated in Python: the numbers move
because `calc` records are scanning, the alarms are real EPICS alarms from real
limit fields, and pressing a button runs a `seq` record inside the IOC.

Check it without the HMI:

```bash
make ioc-verify             # connects every PV, checks the alarms, presses a control
uv run python ioc/run_ioc.py --list   # every PV the IOC will serve
```

Another zone:

```bash
uv run python ioc/generate.py --zone 01
make ioc ZONE_CODE=01
make run-ioc ZONE_CODE=01
```

If PVs do not connect, the usual cause is name resolution rather than the IOC
(`make run-ioc` and `make ioc-verify` set these for you):

```bash
export EPICS_CA_ADDR_LIST=127.0.0.1
export EPICS_CA_AUTO_ADDR_LIST=NO
```

## One declaration, two backends

| A component declares | The simulator | This IOC |
| --- | --- | --- |
| `kind="float"`, a band and a step | random walk in the band | `calc` with `MIN(D,MAX(C,A+(RNDM-0.5)*B))`, `INPA` on its own VAL |
| alarm limits | evaluated on every read | real `HIGH`/`HIHI`/`LOW`/`LOLO` + `HSV`/`HHSV` |
| `kind="bool"`, `states=("CLOSED","OPEN")` | holds; readable by name | `bi` with `ZNAM`/`ONAM`, so `caget` reads CLOSED/OPEN |
| `kind="enum"`, `states=(…)` | index or name, by datatype | `mbbi` with the names in `ZRST`… |
| `kind="string"` | holds | `stringin` |
| `kind="int"` | holds | `longin` with integer limit fields |
| `command=True`, `effects`, `busy` | applies the writes, holds busy | `bo` + `seq` with a delayed release step |
| one value to many records | a loop | one `dfanout` (16 outputs) |
| `undefined=True` | severity INVALID | a record that is never processed — UDF, exactly as in a real IOC |

Nothing in `generate.py` knows what a laser, a chiller or a motor is. Add a
component and the database knows about it the next time this runs.

## Is this a "real" IOC?

Yes, with one asterisk. `run_ioc.py` loads the database into EPICS base's
iocCore — the same C code a built IOC runs — through the `epicscorelibs` wheel
that [pythonSoftIOC](https://github.com/DiamondLightSource/pythonSoftIOC)
packages. Record processing, scan threads, link semantics, alarm evaluation and
the Channel Access server are all base's. What you do not get is a *built* EPICS
installation, and with it the command-line tools.

For those, `Dockerfile` builds base 7.0.8 from the bundled tarball and runs a
stock `softIoc`:

```bash
docker compose -f ioc/docker-compose.yml up --build    # ~10 min the first time
docker exec -it l4-opcpa-ioc caget L4-OPCPA-NL2:FullPower
```

`export-image.sh` / `load-and-run.sh` hand that image to someone who has neither
Python nor EPICS. Host networking is required in both compose files: Channel
Access resolves PV names by UDP broadcast, which Docker's bridge network does
not pass. macOS and Windows have no host network, so use `run_ioc.py` there.

## The `<ZONE>-IOC` zone

Some PVs name a *field* of a record: an EPICS motor record's `.RBV`, an asyn
record's `.CNCT`, an sseq record's `.BUSY`. A record name cannot contain a dot —
Channel Access splits the name there to find the field — so **no base-only IOC
can serve them under their real names**. Reproducing them needs a full EPICS
build with synApps.

So `generate.py` writes a second thing: a copy of the zone with those PVs
pointed at colon-separated stand-ins, as `zones/<ZONE>-IOC/`. Run the HMI with
`ZONE_CODE=<ZONE>-IOC` (which is what `make run-ioc` does). It is a generated
folder, marked as such, and it answers to no hostname, so a station in the hall
can never resolve to it. `tests/test_ioc_db.py` asserts nothing but those names
differs, and that a device's signals stay wired to each other across the
rewrite.

For a screen you want to develop against this IOC, name a motor's signals
explicitly rather than with `prefix:` — see `components/motor/__init__.py`.

## Faults the database starts with

The panel's whole job is telling kinds of bad news apart, so both the simulator
and this database inject one of each rather than leaving it to chance. They come
from the screens themselves (`demo:` in a zone's YAML, or `FAULTS` in
`components/laser_panel/simulate.py`), so a screen shows an engineer what an
alarm looks like without anyone having to break a chiller:

| Injected | Shows up as |
| --- | --- |
| A chiller temperature above its `HIHI` | MAJOR — a real reading the control system dislikes, still displayed |
| A water level that is never processed | INVALID/UDF — `PV INV`, with the tooltip saying why |
| A denied permission whose record calls that MINOR | The interlock pill reads `NO` in a warning tone |
| One module reporting error code `0021` | ERR reads `1/n` instead of `0/n` |
| Two flashlamp channels in `STOP` | The tally is not one full column |

## Files

```
generate.py       a zone -> db + the <ZONE>-IOC zone. Run after editing a screen.
run_ioc.py        runs the db as an IOC from the `ioc` extra (no EPICS build)
verify.py         CA smoke test: connections, alarms, a write, a command
db/<zone>.db      generated; committed so it can be read and diffed
st.cmd            for a stock `softIoc` binary
Dockerfile        builds EPICS base 7.0.8 and runs `softIoc` (adds caget/caput)
docker-compose.yml        build and run the IOC container
docker-compose.image.yml  run a pre-built image instead
export-image.sh / load-and-run.sh   hand that image to a colleague
base-7.0.8.tar.gz         EPICS base source, for the Dockerfile
```

## After editing a screen

```bash
uv run python ioc/generate.py --zone TESTZ
make test          # test_ioc_db.py fails if the committed db is stale
```

A PV read by two components is emitted once — one signal, one record, however
many screens show it. Two components *describing* the same PV differently (a
different band, a different precision) is reported but not fatal: in the hall
that is ordinary, and the first description is the one the database uses.
