"""SQLite-backed persistence for local inference dashboard."""

from __future__ import annotations

import json
import os
import sqlite3
import threading
import time
from pathlib import Path
from typing import Any


def _env_path(name: str, default: Path) -> Path:
    raw = os.environ.get(name, "").strip()
    if not raw:
        return default
    return Path(raw).expanduser().resolve()


class SqliteStore:
    def __init__(self, base_dir: Path) -> None:
        data_dir = _env_path("INFERENCE_DATA_DIR", base_dir / ".data")
        data_dir.mkdir(parents=True, exist_ok=True)
        self._artifacts_dir = data_dir / "artifacts"
        self._artifacts_dir.mkdir(parents=True, exist_ok=True)
        self._db_path = _env_path("INFERENCE_DB_PATH", data_dir / "dashboard.sqlite3")
        self._lock = threading.Lock()
        self._init_schema()

    def _conn(self) -> sqlite3.Connection:
        conn = sqlite3.connect(str(self._db_path), check_same_thread=False)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        return conn

    def _init_schema(self) -> None:
        with self._conn() as conn:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS models (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    display_name TEXT NOT NULL,
                    file_path TEXT NOT NULL UNIQUE,
                    created_at REAL NOT NULL,
                    is_active INTEGER NOT NULL DEFAULT 1
                );

                CREATE TABLE IF NOT EXISTS sessions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    selected_model_id INTEGER NOT NULL REFERENCES models(id),
                    created_at REAL NOT NULL,
                    ended_at REAL,
                    is_active INTEGER NOT NULL DEFAULT 0
                );

                CREATE TABLE IF NOT EXISTS logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    created_at REAL NOT NULL,
                    content_type TEXT,
                    latency_ms REAL NOT NULL,
                    http_status INTEGER NOT NULL,
                    response_body_json TEXT NOT NULL,
                    request_artifact_path TEXT,
                    overlay_artifact_path TEXT,
                    session_id INTEGER REFERENCES sessions(id),
                    model_id INTEGER REFERENCES models(id)
                );
                """
            )

    def models_dir(self) -> Path:
        d = self._db_path.parent / "models"
        d.mkdir(parents=True, exist_ok=True)
        return d

    # Models
    def upsert_model(self, *, display_name: str, file_path: str) -> dict[str, Any]:
        now = time.time()
        with self._lock, self._conn() as conn:
            conn.execute(
                """
                INSERT INTO models(display_name, file_path, created_at, is_active)
                VALUES (?, ?, ?, 1)
                ON CONFLICT(file_path) DO UPDATE SET
                    display_name = excluded.display_name,
                    is_active = 1
                """,
                (display_name, file_path, now),
            )
            row = conn.execute(
                "SELECT id, display_name, file_path, created_at, is_active FROM models WHERE file_path = ?",
                (file_path,),
            ).fetchone()
            return dict(row) if row else {}

    def list_models(self, *, include_inactive: bool = False) -> list[dict[str, Any]]:
        with self._conn() as conn:
            if include_inactive:
                rows = conn.execute(
                    "SELECT id, display_name, file_path, created_at, is_active FROM models ORDER BY created_at DESC"
                ).fetchall()
            else:
                rows = conn.execute(
                    "SELECT id, display_name, file_path, created_at, is_active FROM models WHERE is_active = 1 ORDER BY created_at DESC"
                ).fetchall()
            return [dict(r) for r in rows]

    def get_model(self, model_id: int) -> dict[str, Any] | None:
        with self._conn() as conn:
            row = conn.execute(
                "SELECT id, display_name, file_path, created_at, is_active FROM models WHERE id = ?",
                (model_id,),
            ).fetchone()
            return dict(row) if row else None

    def deactivate_model(self, model_id: int) -> dict[str, Any] | None:
        with self._lock, self._conn() as conn:
            row = conn.execute(
                "SELECT id, display_name, file_path, created_at, is_active FROM models WHERE id = ?",
                (model_id,),
            ).fetchone()
            if row is None:
                return None
            conn.execute("UPDATE models SET is_active = 0 WHERE id = ?", (model_id,))
            updated = conn.execute(
                "SELECT id, display_name, file_path, created_at, is_active FROM models WHERE id = ?",
                (model_id,),
            ).fetchone()
            return dict(updated) if updated else None

    # Sessions
    def start_session(self, *, name: str, model_id: int) -> dict[str, Any]:
        now = time.time()
        with self._lock, self._conn() as conn:
            conn.execute("UPDATE sessions SET is_active = 0 WHERE is_active = 1")
            cur = conn.execute(
                """
                INSERT INTO sessions(name, selected_model_id, created_at, ended_at, is_active)
                VALUES (?, ?, ?, NULL, 1)
                """,
                (name, model_id, now),
            )
            session_id = cur.lastrowid
            row = conn.execute(
                """
                SELECT s.id, s.name, s.selected_model_id, s.created_at, s.ended_at, s.is_active,
                       m.display_name AS model_name, m.file_path AS model_file_path
                FROM sessions s
                JOIN models m ON m.id = s.selected_model_id
                WHERE s.id = ?
                """,
                (session_id,),
            ).fetchone()
            return dict(row) if row else {}

    def end_active_session(self) -> dict[str, Any] | None:
        now = time.time()
        with self._lock, self._conn() as conn:
            row = conn.execute("SELECT id FROM sessions WHERE is_active = 1 LIMIT 1").fetchone()
            if not row:
                return None
            sid = int(row["id"])
            conn.execute(
                "UPDATE sessions SET is_active = 0, ended_at = ? WHERE id = ?",
                (now, sid),
            )
            ended = conn.execute(
                "SELECT id, name, selected_model_id, created_at, ended_at, is_active FROM sessions WHERE id = ?",
                (sid,),
            ).fetchone()
            return dict(ended) if ended else None

    def get_active_session(self) -> dict[str, Any] | None:
        with self._conn() as conn:
            row = conn.execute(
                """
                SELECT s.id, s.name, s.selected_model_id, s.created_at, s.ended_at, s.is_active,
                       m.display_name AS model_name, m.file_path AS model_file_path
                FROM sessions s
                JOIN models m ON m.id = s.selected_model_id
                WHERE s.is_active = 1
                LIMIT 1
                """
            ).fetchone()
            return dict(row) if row else None

    def list_sessions(self) -> list[dict[str, Any]]:
        with self._conn() as conn:
            rows = conn.execute(
                """
                SELECT s.id, s.name, s.selected_model_id, s.created_at, s.ended_at, s.is_active,
                       m.display_name AS model_name
                FROM sessions s
                JOIN models m ON m.id = s.selected_model_id
                ORDER BY s.created_at DESC
                """
            ).fetchall()
            return [dict(r) for r in rows]

    def clear_all_sessions(self) -> int:
        """Delete every session row. Detaches logs (session_id set to NULL) so FK does not block."""
        with self._lock, self._conn() as conn:
            conn.execute("UPDATE logs SET session_id = NULL WHERE session_id IS NOT NULL")
            cur = conn.execute("DELETE FROM sessions")
            return int(cur.rowcount or 0)

    # Logs
    def add_log(
        self,
        *,
        content_type: str | None,
        latency_ms: float,
        http_status: int,
        response_body: dict[str, Any],
        request_image: bytes | None,
        overlay_png: bytes | None,
        session_id: int | None,
        model_id: int | None,
    ) -> int:
        now = time.time()
        with self._lock, self._conn() as conn:
            cur = conn.execute(
                """
                INSERT INTO logs(
                    created_at, content_type, latency_ms, http_status,
                    response_body_json, request_artifact_path, overlay_artifact_path,
                    session_id, model_id
                )
                VALUES (?, ?, ?, ?, ?, NULL, NULL, ?, ?)
                """,
                (now, content_type, latency_ms, http_status, json.dumps(response_body), session_id, model_id),
            )
            log_id = int(cur.lastrowid)
            req_path = None
            ov_path = None
            if request_image:
                req_file = self._artifacts_dir / f"log_{log_id}_request.bin"
                req_file.write_bytes(request_image)
                req_path = str(req_file)
            if overlay_png:
                ov_file = self._artifacts_dir / f"log_{log_id}_overlay.png"
                ov_file.write_bytes(overlay_png)
                ov_path = str(ov_file)
            if req_path or ov_path:
                conn.execute(
                    "UPDATE logs SET request_artifact_path = ?, overlay_artifact_path = ? WHERE id = ?",
                    (req_path, ov_path, log_id),
                )
            return log_id

    def list_logs(
        self,
        *,
        session_id: int | None = None,
        model_id: int | None = None,
        status: int | None = None,
        since_ts: float | None = None,
        until_ts: float | None = None,
        limit: int = 200,
    ) -> list[dict[str, Any]]:
        where = []
        params: list[Any] = []
        if session_id is not None:
            where.append("l.session_id = ?")
            params.append(session_id)
        if model_id is not None:
            where.append("l.model_id = ?")
            params.append(model_id)
        if status is not None:
            where.append("l.http_status = ?")
            params.append(status)
        if since_ts is not None:
            where.append("l.created_at >= ?")
            params.append(since_ts)
        if until_ts is not None:
            where.append("l.created_at <= ?")
            params.append(until_ts)
        where_sql = f"WHERE {' AND '.join(where)}" if where else ""
        with self._conn() as conn:
            rows = conn.execute(
                f"""
                SELECT l.id, l.created_at, l.content_type, l.latency_ms, l.http_status,
                       l.request_artifact_path, l.overlay_artifact_path, l.session_id, l.model_id,
                       s.name AS session_name, m.display_name AS model_name, l.response_body_json
                FROM logs l
                LEFT JOIN sessions s ON s.id = l.session_id
                LEFT JOIN models m ON m.id = l.model_id
                {where_sql}
                ORDER BY l.created_at DESC
                LIMIT ?
                """,
                (*params, int(limit)),
            ).fetchall()
        out: list[dict[str, Any]] = []
        for r in rows:
            item = dict(r)
            body = {}
            try:
                body = json.loads(item.pop("response_body_json") or "{}")
            except json.JSONDecodeError:
                body = {}
            item["response"] = body
            item["has_image"] = bool(item.get("request_artifact_path"))
            item["has_overlay"] = bool(item.get("overlay_artifact_path"))
            out.append(item)
        return out

    def get_log(self, log_id: int) -> dict[str, Any] | None:
        with self._conn() as conn:
            row = conn.execute(
                """
                SELECT l.id, l.created_at, l.content_type, l.latency_ms, l.http_status,
                       l.request_artifact_path, l.overlay_artifact_path, l.session_id, l.model_id,
                       s.name AS session_name, m.display_name AS model_name, l.response_body_json
                FROM logs l
                LEFT JOIN sessions s ON s.id = l.session_id
                LEFT JOIN models m ON m.id = l.model_id
                WHERE l.id = ?
                """,
                (log_id,),
            ).fetchone()
        if row is None:
            return None
        item = dict(row)
        try:
            item["response"] = json.loads(item.pop("response_body_json") or "{}")
        except json.JSONDecodeError:
            item["response"] = {}
        item["has_image"] = bool(item.get("request_artifact_path"))
        item["has_overlay"] = bool(item.get("overlay_artifact_path"))
        return item

    def read_artifact(self, path: str | None) -> bytes | None:
        if not path:
            return None
        p = Path(path)
        if not p.is_file():
            return None
        try:
            return p.read_bytes()
        except OSError:
            return None

    def clear_logs(self) -> None:
        with self._lock, self._conn() as conn:
            rows = conn.execute(
                "SELECT request_artifact_path, overlay_artifact_path FROM logs"
            ).fetchall()
            conn.execute("DELETE FROM logs")
        for row in rows:
            for k in ("request_artifact_path", "overlay_artifact_path"):
                p = row[k]
                if p:
                    try:
                        Path(p).unlink(missing_ok=True)
                    except OSError:
                        pass

    def metrics(
        self,
        *,
        session_id: int | None = None,
        model_id: int | None = None,
    ) -> dict[str, Any]:
        where = []
        params: list[Any] = []
        if session_id is not None:
            where.append("session_id = ?")
            params.append(session_id)
        if model_id is not None:
            where.append("model_id = ?")
            params.append(model_id)
        where_sql = f"WHERE {' AND '.join(where)}" if where else ""
        with self._conn() as conn:
            row = conn.execute(
                f"""
                SELECT
                    COUNT(*) AS total_requests,
                    SUM(CASE WHEN http_status >= 400 THEN 1 ELSE 0 END) AS error_count,
                    AVG(latency_ms) AS avg_latency_ms
                FROM logs
                {where_sql}
                """,
                params,
            ).fetchone()
            det_rows = conn.execute(
                f"SELECT response_body_json FROM logs {where_sql}",
                params,
            ).fetchall()
        total_detections = 0
        for r in det_rows:
            try:
                body = json.loads(r["response_body_json"] or "{}")
            except json.JSONDecodeError:
                continue
            if isinstance(body.get("predictions"), list):
                total_detections += len(body["predictions"])
            elif isinstance(body.get("estimatedDistances"), list):
                total_detections += len(body["estimatedDistances"])

        total_requests = int(row["total_requests"] or 0)
        error_count = int(row["error_count"] or 0)
        return {
            "total_requests": total_requests,
            "error_count": error_count,
            "error_rate": (error_count / total_requests) if total_requests else 0.0,
            "avg_latency_ms": float(row["avg_latency_ms"] or 0.0),
            "total_detections": total_detections,
        }
