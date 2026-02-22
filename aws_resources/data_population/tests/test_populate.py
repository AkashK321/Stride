import pytest
import math
from populate_floor_data import (
    calculate_bearing,
    calculate_distance,
    feet_to_pixels
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