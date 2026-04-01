"""Bounded in-memory ring buffer for invocation logs (dev dashboard)."""

from __future__ import annotations

import os
import threading
import time
from collections import deque
from dataclasses import dataclass, field
from typing import Any


def _env_int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, str(default)))
    except ValueError:
        return default


@dataclass
class LogEntry:
    id: int
    created_at: float
    content_type: str | None
    latency_ms: float
    http_status: int
    request_image: bytes | None
    response_body: dict[str, Any]
    overlay_png: bytes | None = None


class LogStore:
    def __init__(self) -> None:
        self._max_entries = _env_int("LOG_MAX_ENTRIES", 100)
        self._max_image_bytes = _env_int("LOG_MAX_IMAGE_BYTES", 2 * 1024 * 1024)
        self._deque: deque[LogEntry] = deque(maxlen=self._max_entries)
        self._next_id = 1
        self._lock = threading.Lock()

    def add(
        self,
        *,
        content_type: str | None,
        latency_ms: float,
        http_status: int,
        request_image: bytes | None,
        response_body: dict[str, Any],
        overlay_png: bytes | None = None,
    ) -> LogEntry:
        img = request_image
        if img is not None and len(img) > self._max_image_bytes:
            img = img[: self._max_image_bytes]

        with self._lock:
            eid = self._next_id
            self._next_id += 1
            entry = LogEntry(
                id=eid,
                created_at=time.time(),
                content_type=content_type,
                latency_ms=latency_ms,
                http_status=http_status,
                request_image=img,
                response_body=response_body,
                overlay_png=overlay_png,
            )
            self._deque.append(entry)
            return entry

    def list_entries(self) -> list[LogEntry]:
        with self._lock:
            return list(self._deque)

    def get(self, entry_id: int) -> LogEntry | None:
        with self._lock:
            for e in self._deque:
                if e.id == entry_id:
                    return e
        return None

    def clear(self) -> None:
        with self._lock:
            self._deque.clear()
