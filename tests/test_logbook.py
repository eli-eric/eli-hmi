"""The log book: the last few thousand log records, kept for `/monitor`, and
— when `LOG_DIR` is set — written to disk so a restart does not erase them.

Each test attaches the book to a logger of its own rather than to the root, so
nothing here depends on, or disturbs, what pytest has done to logging.
"""

from __future__ import annotations

import itertools
import json
import logging
import re

import pytest

from core.logbook import LogBook
from core.settings import Settings, SettingsError

_names = itertools.count()


@pytest.fixture
def log():
    logger = logging.getLogger(f"tests.logbook.{next(_names)}")
    logger.setLevel(logging.DEBUG)
    logger.propagate = False
    yield logger
    logger.handlers.clear()


def attached(log, **kwargs) -> LogBook:
    book = LogBook(**kwargs)
    book.attach(log)
    return book


class TestInMemory:
    def test_a_record_is_kept_with_its_level_logger_and_message(self, log):
        book = attached(log)
        log.warning("write refused user=%s pv=%s", "alice", "X:Y")
        [entry] = book.entries()
        assert entry.level == "WARNING" and entry.levelno == logging.WARNING
        assert entry.logger == log.name
        assert entry.message == "write refused user=alice pv=X:Y"
        assert entry.exc is None
        assert entry.run == book.run
        assert entry.time > 0

    def test_an_exception_keeps_its_traceback(self, log):
        book = attached(log)
        try:
            raise ValueError("boom")
        except ValueError:
            log.exception("write FAILED user=alice")
        [entry] = book.entries()
        assert entry.level == "ERROR"
        assert "Traceback" in entry.exc and "ValueError: boom" in entry.exc

    def test_entries_after_a_sequence_number_are_only_the_newer_ones(self, log):
        """How the live stream asks for what it has not sent yet."""
        book = attached(log)
        log.info("one")
        seen = book.last_seq
        log.info("two")
        log.info("three")
        assert [entry.message for entry in book.entries(after=seen)] == ["two", "three"]
        assert book.entries(after=book.last_seq) == []

    def test_only_the_newest_are_kept(self, log):
        book = attached(log, capacity=3)
        for number in range(5):
            log.info("line %d", number)
        assert [entry.message for entry in book.entries()] == ["line 2", "line 3", "line 4"]
        assert book.last_seq == 5

    def test_counts_cover_the_whole_run_not_just_what_is_kept(self, log):
        book = attached(log, capacity=1)
        log.warning("a")
        log.warning("b")
        log.error("c")
        assert book.counts["WARNING"] == 2
        assert book.counts["ERROR"] == 1

    def test_a_detached_book_hears_nothing_more(self, log):
        book = attached(log)
        log.info("kept")
        book.detach()
        log.info("not kept")
        assert [entry.message for entry in book.entries()] == ["kept"]
        assert book not in log.handlers


class TestOnDisk:
    """With `LOG_DIR` set, the book is also a rotating JSON-lines file, read
    back on start-up: the moment someone opens `/monitor` to ask what happened
    is usually just after the restart that erased the memory of it."""

    def test_records_are_written_as_json_lines(self, log, tmp_path):
        book = attached(log, directory=tmp_path)
        log.warning("write refused user=%s", "alice")
        book.detach()
        [line] = (tmp_path / "eli-hmi.jsonl").read_text().splitlines()
        record = json.loads(line)
        assert record["message"] == "write refused user=alice"
        assert record["level"] == "WARNING"
        assert record["run"] == book.run

    def test_a_restarted_book_still_has_the_earlier_run(self, log, tmp_path):
        before = attached(log, directory=tmp_path)
        log.error("before the restart")
        before.detach()

        after = attached(log, directory=tmp_path)
        log.info("after the restart")
        entries = after.entries()
        assert [entry.message for entry in entries] == ["before the restart", "after the restart"]
        assert entries[0].run == before.run != after.run
        assert after.counts["ERROR"] == 0, "the counts are this run's"
        after.detach()

    def test_the_file_rotates_and_keeps_a_bounded_history(self, log, tmp_path):
        book = attached(log, directory=tmp_path, max_bytes=600, backups=2)
        for number in range(40):
            log.info("line %02d", number)
        book.detach()
        files = sorted(path.name for path in tmp_path.iterdir())
        assert files == ["eli-hmi.jsonl", "eli-hmi.jsonl.1", "eli-hmi.jsonl.2"]

    def test_the_export_is_everything_on_disk_oldest_first(self, log, tmp_path):
        book = attached(log, directory=tmp_path, capacity=5, max_bytes=600, backups=2)
        for number in range(40):
            log.info("line %02d", number)
        exported = [line for line in book.export() if "line " in line]
        numbers = [int(line.rsplit(" ", 1)[1]) for line in exported]
        assert numbers == sorted(numbers) and numbers[-1] == 39
        assert len(numbers) > 5, "the export is the files, not the in-memory ring"
        assert re.match(r"\d{4}-\d\d-\d\d \d\d:\d\d:\d\d,\d{3} INFO +tests\.logbook", exported[0])
        book.detach()

    def test_without_a_directory_the_export_is_the_ring(self, log):
        book = attached(log)
        log.info("only in memory")
        assert [line for line in book.export() if "only in memory" in line]

    def test_a_directory_that_cannot_hold_the_file_stops_the_start(self, tmp_path):
        """Asked to keep logs and unable to: say so at start-up, like a missing
        SESSION_SECRET, rather than discover the gap when the logs are needed."""
        blocker = tmp_path / "not-a-directory"
        blocker.write_text("")
        with pytest.raises(SettingsError, match="LOG_DIR"):
            LogBook(directory=blocker)

    def test_log_dir_comes_from_the_environment(self, monkeypatch):
        monkeypatch.setenv("LOG_DIR", "/var/log/eli-hmi")
        assert Settings.from_env().log_dir == "/var/log/eli-hmi"
