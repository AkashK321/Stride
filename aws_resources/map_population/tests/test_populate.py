import pytest
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from populate_floor_data import (
    calculate_bearing,
    calculate_distance,
    build_node_meta_for_storage,
    rotate_coords_for_storage,
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

