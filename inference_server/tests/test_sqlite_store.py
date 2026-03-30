from pathlib import Path

from app.persistence.sqlite_store import SqliteStore


def test_models_sessions_logs_metrics(tmp_path: Path, monkeypatch):
    monkeypatch.setenv("INFERENCE_DATA_DIR", str(tmp_path / "data"))
    monkeypatch.setenv("INFERENCE_DB_PATH", str(tmp_path / "data" / "dash.sqlite3"))

    store = SqliteStore(tmp_path)
    model = store.upsert_model(display_name="test-model", file_path=str(tmp_path / "m.pt"))
    assert model["display_name"] == "test-model"

    sess = store.start_session(name="session-a", model_id=int(model["id"]))
    assert sess["name"] == "session-a"
    assert int(sess["selected_model_id"]) == int(model["id"])

    log_id = store.add_log(
        content_type="image/jpeg",
        latency_ms=12.3,
        http_status=200,
        response_body={"success": True, "estimatedDistances": [{"d": 1}]},
        request_image=b"img",
        overlay_png=b"png",
        session_id=int(sess["id"]),
        model_id=int(model["id"]),
    )
    assert log_id > 0

    logs = store.list_logs(session_id=int(sess["id"]))
    assert len(logs) == 1
    assert logs[0]["has_image"] is True
    assert logs[0]["has_overlay"] is True

    metrics = store.metrics(session_id=int(sess["id"]))
    assert metrics["total_requests"] == 1
    assert metrics["total_detections"] == 1


def test_clear_all_sessions_detaches_logs(tmp_path: Path, monkeypatch):
    monkeypatch.setenv("INFERENCE_DATA_DIR", str(tmp_path / "data"))
    monkeypatch.setenv("INFERENCE_DB_PATH", str(tmp_path / "data" / "dash2.sqlite3"))

    store = SqliteStore(tmp_path)
    model = store.upsert_model(display_name="m", file_path=str(tmp_path / "m2.pt"))
    sess = store.start_session(name="s", model_id=int(model["id"]))
    sid = int(sess["id"])
    store.add_log(
        content_type="image/jpeg",
        latency_ms=1.0,
        http_status=200,
        response_body={},
        request_image=None,
        overlay_png=None,
        session_id=sid,
        model_id=int(model["id"]),
    )
    deleted = store.clear_all_sessions()
    assert deleted >= 1
    assert store.list_sessions() == []
    rows = store.list_logs()
    assert len(rows) == 1
    assert rows[0].get("session_id") is None
    assert rows[0].get("session_name") is None

