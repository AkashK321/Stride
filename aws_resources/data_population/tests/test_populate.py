import pytest
import math
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from populate_floor_data import (
    calculate_bearing,
    calculate_distance,
    feet_to_pixels,
    align_bearing_to_true_north,
)

def test_feet_to_pixels():
    """Test coordinate conversion"""
    assert feet_to_pixels(0) == 0
    assert feet_to_pixels(10) == 100
    assert feet_to_pixels(5.5) == 55


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
    distance = calculate_distance(0, 0, 100, 0)  # 100 pixels = 10 feet
    assert distance == pytest.approx(3.048, abs=0.01)
    
    # Pythagorean: 3-4-5 triangle (30-40-50 pixels = 3-4-5 feet)
    distance = calculate_distance(0, 0, 30, 40)
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


def test_align_bearing_to_true_north_no_offset():
    """With offset 0 and no flip, bearing is unchanged."""
    assert align_bearing_to_true_north(0, offset_deg=0, apply_horizontal_flip=False) == pytest.approx(0, abs=0.1)
    assert align_bearing_to_true_north(90, offset_deg=0, apply_horizontal_flip=False) == pytest.approx(90, abs=0.1)
    assert align_bearing_to_true_north(270, offset_deg=0, apply_horizontal_flip=False) == pytest.approx(270, abs=0.1)


def test_align_bearing_to_true_north_with_offset():
    """Offset is added and result normalized to 0-360."""
    assert align_bearing_to_true_north(0, offset_deg=55, apply_horizontal_flip=False) == pytest.approx(55, abs=0.1)
    assert align_bearing_to_true_north(90, offset_deg=55, apply_horizontal_flip=False) == pytest.approx(145, abs=0.1)
    assert align_bearing_to_true_north(310, offset_deg=55, apply_horizontal_flip=False) == pytest.approx(5, abs=0.1)


def test_align_bearing_to_true_north_horizontal_flip():
    """With flip, horizontal bearings (45-135, 225-315) get +180 before offset."""
    # 90 (East) -> 270 after flip, then +0 offset = 270
    assert align_bearing_to_true_north(90, offset_deg=0, apply_horizontal_flip=True) == pytest.approx(270, abs=0.1)
    # 270 (West) -> 90 after flip
    assert align_bearing_to_true_north(270, offset_deg=0, apply_horizontal_flip=True) == pytest.approx(90, abs=0.1)
    # North 0 is not horizontal, unchanged
    assert align_bearing_to_true_north(0, offset_deg=0, apply_horizontal_flip=True) == pytest.approx(0, abs=0.1)