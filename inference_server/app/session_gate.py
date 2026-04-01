"""
Gated /invocations: optional session + shared secret (for tunnel exposure).

When INFERENCE_REQUIRE_SESSION=1, POST /invocations is rejected unless:
  1) A dashboard "session" is active (Start session), and
  2) Header X-Stride-Inference-Secret matches the session token (use secrets.compare_digest).

Lambda should set env INFERENCE_HTTP_SECRET to the same value (not the mobile app).
"""

from __future__ import annotations

import os
import secrets
import threading
import time
from dataclasses import dataclass, field


HEADER_NAME = "X-Stride-Inference-Secret"


def require_session_enabled() -> bool:
    v = os.environ.get("INFERENCE_REQUIRE_SESSION", "").strip().lower()
    return v in ("1", "true", "yes")


@dataclass
class InferenceSessionState:
    """In-memory session token (lost on process restart)."""

    _token: str | None = field(default=None, repr=False)
    _started_at: float | None = field(default=None, repr=False)
    _lock: threading.Lock = field(default_factory=threading.Lock, repr=False)

    def start(self) -> str:
        with self._lock:
            self._token = secrets.token_urlsafe(32)
            self._started_at = time.time()
            return self._token

    def end(self) -> None:
        with self._lock:
            self._token = None
            self._started_at = None

    def active(self) -> bool:
        with self._lock:
            return self._token is not None

    def started_at(self) -> float | None:
        with self._lock:
            return self._started_at

    def verify_secret(self, header_value: str | None) -> bool:
        with self._lock:
            if not self._token:
                return False
            if not header_value or not header_value.strip():
                return False
            return secrets.compare_digest(self._token, header_value.strip())
