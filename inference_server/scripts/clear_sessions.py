#!/usr/bin/env python3
"""Remove all dashboard session rows and detach logs (session_id -> NULL).

Uses the same SQLite paths as the server: INFERENCE_DATA_DIR and INFERENCE_DB_PATH
if set; otherwise inference_server/.data/dashboard.sqlite3.

If the inference server is running, restart it afterward so in-memory session
state matches the database.
"""

from __future__ import annotations

import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from app.persistence.sqlite_store import SqliteStore  # noqa: E402


def main() -> int:
    store = SqliteStore(_ROOT)
    n = store.clear_all_sessions()
    print(f"Cleared {n} session row(s). Logs kept; session_id set to NULL on existing log rows.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
