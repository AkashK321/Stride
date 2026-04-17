import pytest
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from populate_floor_data import (
    calculate_bearing,
    calculate_distance,
    build_node_meta_for_storage,
    rotate_coords_for_storage,
    get_db_secret,
)

def test_rotate_coords_for_storage_zero_angle():
    """0-degree offset should preserve coordinates."""
    assert rotate_coords_for_storage(0, 0, 0) == (0, 0)
    assert rotate_coords_for_storage(10, 5, 0) == (10, 5)


def test_calculate_bearing():
    """Test bearing calculation"""
    # North (straight up) - y decreases going up in screen coords
    assert calculate_bearing(0, 10, 0, 0) == pytest.approx(0, abs=0.1)
    
    # East (right)
    assert calculate_bearing(0, 0, 10, 0) == pytest.approx(90, abs=0.1)
    
    # South (down) - y increases going down
    assert calculate_bearing(0, 0, 0, 10) == pytest.approx(180, abs=0.1)
    
    # West (left)
    assert calculate_bearing(10, 0, 0, 0) == pytest.approx(270, abs=0.1)


def test_calculate_distance():
    """Test distance calculation"""
    # 10 feet horizontal = 3.048 meters
    distance = calculate_distance(0, 0, 10, 0)
    assert distance == pytest.approx(3.048, abs=0.01)
    
    # Pythagorean: 3-4-5 triangle in feet
    distance = calculate_distance(0, 0, 3, 4)
    expected = 5 * 0.3048  # 5 feet in meters
    assert distance == pytest.approx(expected, abs=0.01)
    
    # Zero distance
    assert calculate_distance(0, 0, 0, 0) == pytest.approx(0, abs=0.01)


def test_calculate_bearing_edge_cases():
    """Test bearing calculation edge cases"""
    # Diagonal Northeast
    assert calculate_bearing(0, 10, 10, 0) == pytest.approx(45, abs=0.1)
    
    # Diagonal Southeast  
    assert calculate_bearing(0, 0, 10, 10) == pytest.approx(135, abs=0.1)


def test_build_node_meta_for_storage_from_semantic_fields():
    """Top-level doors/intersections should be persisted in NodeMeta."""
    node = {
        "id": "n1",
        "x_feet": 0,
        "y_feet": 0,
        "type": "HallwayPoint",
        "doors": [{"id": "room_101"}],
        "intersections": [{"id": "x1", "kind": "tee"}],
    }
    assert build_node_meta_for_storage(node) == {
        "doors": [{"id": "room_101"}],
        "intersections": [{"id": "x1", "kind": "tee"}],
    }


def test_build_node_meta_for_storage_prefers_explicit_node_meta():
    """Legacy explicit node_meta should continue to pass through unchanged."""
    node = {
        "id": "n1",
        "x_feet": 0,
        "y_feet": 0,
        "type": "HallwayPoint",
        "doors": [{"id": "room_101"}],
        "node_meta": {"custom": "value"},
    }
    assert build_node_meta_for_storage(node) == {"custom": "value"}


def test_build_node_meta_for_storage_rotates_side_by_bearing_with_offset():
    """Door side_by_bearing headings should rotate with side-bearing offset."""
    node = {
        "id": "n1",
        "x_feet": 0,
        "y_feet": 0,
        "type": "HallwayPoint",
        "doors": [
            {
                "id": "room_101",
                "label": "Room 101",
                "side_by_bearing": [
                    {"bearing_deg": 0, "side": "left"},
                    {"bearing_deg": 270, "side": "right"},
                ],
            }
        ],
    }

    result = build_node_meta_for_storage(node, side_by_bearing_offset_deg=51.0)
    assert result == {
        "doors": [
            {
                "id": "room_101",
                "label": "Room 101",
                "side_by_bearing": [
                    {"bearing_deg": 51.0, "side": "left"},
                    {"bearing_deg": 321.0, "side": "right"},
                ],
            }
        ]
    }


def test_get_db_secret_uses_env_fallback_when_secret_arn_missing(monkeypatch):
    monkeypatch.delenv("DB_SECRET_ARN", raising=False)
    monkeypatch.setenv("DB_HOST", "localhost")
    monkeypatch.setenv("DB_PORT", "5432")
    monkeypatch.setenv("DB_NAME", "stride")
    monkeypatch.setenv("DB_USER", "stride_user")
    monkeypatch.setenv("DB_PASSWORD", "stride_pass")

    creds = get_db_secret()

    assert creds == {
        "host": "localhost",
        "port": "5432",
        "dbname": "stride",
        "username": "stride_user",
        "password": "stride_pass",
    }


def test_get_db_secret_falls_back_to_env_on_secret_fetch_error(monkeypatch):
    class FailingSecretsClient:
        def get_secret_value(self, SecretId):
            raise RuntimeError("AccessDenied")

    monkeypatch.setenv("DB_SECRET_ARN", "arn:aws:secretsmanager:us-east-1:1234:secret:test")
    monkeypatch.setenv("DB_HOST", "localhost")
    monkeypatch.setenv("DB_PORT", "5432")
    monkeypatch.setenv("DB_NAME", "stride")
    monkeypatch.setenv("DB_USER", "stride_user")
    monkeypatch.setenv("DB_PASSWORD", "stride_pass")
    monkeypatch.setattr("populate_floor_data.boto3.client", lambda service: FailingSecretsClient())

    creds = get_db_secret()

    assert creds["host"] == "localhost"
    assert creds["port"] == "5432"
    assert creds["dbname"] == "stride"
    assert creds["username"] == "stride_user"
    assert creds["password"] == "stride_pass"

