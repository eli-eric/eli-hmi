"""The log book: recent log records, kept where `/monitor` can show them.

The console stays what it was — one plain line per record on stderr, for
`docker logs` and journald. The log book is a second handler on the root logger
that keeps the last few thousand records in memory, structured, so the
dashboard can colour them, filter them and stream the new ones as they happen.

With `LOG_DIR` set it also writes every record to a rotating JSON-lines file
there, and reads the newest of it back on start-up. That is the point of the
file: the moment someone opens `/monitor` to ask what happened is usually just
after the restart that would otherwise have erased it. JSON rather than the
console's text because a traceback spans lines and a message can contain
anything — read back, each record is exactly what was logged.

It is attached when the app starts serving and detached when it stops
(`core.server`), rather than at import, because every test builds an app of its
own and handlers left on the root logger would pile up.

Records arrive from whichever thread logged them, and the dashboard reads on
the event loop, so every touch of the ring holds the handler's own lock.
"""

from __future__ import annotations

import json
import logging
import os
import time
from collections import Counter, deque
from dataclasses import asdict, dataclass
from datetime import datetime
from logging.handlers import RotatingFileHandler
from pathlib import Path
from typing import Iterable, Iterator

from core.settings import SettingsError

#: How many records the dashboard can show. A busy station logs a few hundred
#: lines an hour, so this is a shift or more.
DEFAULT_CAPACITY = 2000
#: The file under `LOG_DIR`, and how much of it is kept: 10 MB a file, the
#: current one plus five, so a few weeks of a normal station's log.
FILE_NAME = "eli-hmi.jsonl"
FILE_MAX_BYTES = 10 * 2**20
FILE_BACKUPS = 5

_FORMATTER = logging.Formatter()


@dataclass(frozen=True)
class LogEntry:
    seq: int
    #: When it was logged, epoch seconds.
    time: float
    level: str
    levelno: int
    logger: str
    message: str
    #: The formatted traceback, when the record carried one.
    exc: str | None
    #: Which process start logged it: `LogBook.run` for this one.
    run: str


def format_line(entry: LogEntry) -> str:
    """The console's own format, for the text export."""
    moment = datetime.fromtimestamp(entry.time)
    millis = int(entry.time * 1000) % 1000
    line = (
        f"{moment:%Y-%m-%d %H:%M:%S},{millis:03d} {entry.level:<7} "
        f"{entry.logger}: {entry.message}\n"
    )
    return line + (entry.exc.rstrip("\n") + "\n" if entry.exc else "")


class _JsonLines(logging.Formatter):
    """Writes the entry the log book already built for this record, so the
    file and the ring cannot describe the same record differently."""

    def format(self, record: logging.LogRecord) -> str:
        entry = getattr(record, "logbook_entry")
        fields = asdict(entry)
        del fields["seq"]  # a position in one process's ring, meaningless on disk
        return json.dumps(fields, ensure_ascii=False)


class LogBook(logging.Handler):
    def __init__(
        self,
        capacity: int = DEFAULT_CAPACITY,
        directory: str | Path | None = None,
        *,
        max_bytes: int = FILE_MAX_BYTES,
        backups: int = FILE_BACKUPS,
    ) -> None:
        super().__init__()
        #: Tells this process's entries from an earlier run's.
        self.run = f"{os.getpid()}-{time.time_ns():x}"
        self._entries: deque[LogEntry] = deque(maxlen=capacity)
        self._seq = 0
        #: Records per level since this run started, kept or not.
        self.counts: Counter[str] = Counter()
        self._loggers: list[logging.Logger] = []
        self._file: RotatingFileHandler | None = None
        self._backups = backups
        self.path: Path | None = None
        if directory is not None:
            self.path = Path(directory) / FILE_NAME
            self._read_back()
            self._file = self._open(max_bytes)

    # ------------------------------------------------------------- lifecycle

    def attach(self, logger: logging.Logger | None = None) -> None:
        logger = logger if logger is not None else logging.getLogger()
        logger.addHandler(self)
        self._loggers.append(logger)

    def detach(self) -> None:
        for logger in self._loggers:
            logger.removeHandler(self)
        self._loggers.clear()
        if self._file is not None:
            self._file.close()

    # ---------------------------------------------------------------- writing

    def emit(self, record: logging.LogRecord) -> None:
        # `Handler.handle` already holds `self.lock` around this call.
        try:
            exc = None
            if record.exc_info:
                exc = record.exc_text or _FORMATTER.formatException(record.exc_info)
            elif record.exc_text:
                exc = record.exc_text
            self._seq += 1
            entry = LogEntry(
                seq=self._seq,
                time=record.created,
                level=record.levelname,
                levelno=record.levelno,
                logger=record.name,
                message=record.getMessage(),
                exc=exc,
                run=self.run,
            )
        except Exception:  # noqa: BLE001 - logging must never raise
            self.handleError(record)
            return
        self._entries.append(entry)
        self.counts[entry.level] += 1
        if self._file is not None:
            record.logbook_entry = entry
            self._file.handle(record)

    # ---------------------------------------------------------------- reading

    @property
    def last_seq(self) -> int:
        with self.lock:
            return self._seq

    def entries(self, after: int = 0) -> list[LogEntry]:
        """Kept entries newer than `after`, oldest first."""
        with self.lock:
            return [entry for entry in self._entries if entry.seq > after]

    def export(self) -> Iterator[str]:
        """Every record there is, oldest first, as console-style text lines:
        all of the files when there is a directory, else the ring."""
        if self.path is None:
            for entry in self.entries():
                yield format_line(entry)
            return
        for path in reversed(self._files()):
            for entry in _parse(_lines(path), first_seq=0):
                yield format_line(entry)

    # ------------------------------------------------------------------ disk

    def _files(self) -> list[Path]:
        """Newest first: the current file, then `.1`, `.2`, … that exist."""
        assert self.path is not None
        candidates = [self.path] + [
            self.path.with_name(f"{self.path.name}.{n}") for n in range(1, self._backups + 1)
        ]
        return [path for path in candidates if path.is_file()]

    def _read_back(self) -> None:
        """Fill the ring from the newest files — only as many as it holds."""
        assert self.path is not None
        needed = self._entries.maxlen or 0
        newest_first: list[list[str]] = []
        for path in self._files():
            lines = _lines(path)
            newest_first.append(lines)
            needed -= len(lines)
            if needed <= 0:
                break
        lines = [line for chunk in reversed(newest_first) for line in chunk]
        for entry in _parse(lines, first_seq=self._seq):
            self._entries.append(entry)
            self._seq = entry.seq

    def _open(self, max_bytes: int) -> RotatingFileHandler:
        assert self.path is not None
        try:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            handler = RotatingFileHandler(
                self.path, maxBytes=max_bytes, backupCount=self._backups, encoding="utf-8"
            )
        except OSError as exc:
            raise SettingsError(
                f"LOG_DIR={self.path.parent}: cannot keep the log file there ({exc}). "
                "Point LOG_DIR at a writable directory, or unset it to keep the log in memory only."
            ) from exc
        handler.setFormatter(_JsonLines())
        return handler


def _lines(path: Path) -> list[str]:
    try:
        return path.read_text(encoding="utf-8", errors="replace").splitlines()
    except OSError:
        return []


def _parse(lines: Iterable[str], *, first_seq: int) -> Iterator[LogEntry]:
    """Entries from JSON lines, numbered on from `first_seq`. A line that does
    not parse — the half-written last line of a crash — is skipped."""
    seq = first_seq
    for line in lines:
        try:
            fields = json.loads(line)
            seq += 1
            yield LogEntry(
                seq=seq,
                time=float(fields["time"]),
                level=str(fields["level"]),
                levelno=int(fields["levelno"]),
                logger=str(fields["logger"]),
                message=str(fields["message"]),
                exc=fields.get("exc"),
                run=str(fields["run"]),
            )
        except (ValueError, KeyError, TypeError):
            continue
