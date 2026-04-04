import pytest
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from populate_floor_data import (
    calculate_bearing,
    calculate_distance,
    feet_to_pixels,
    align_bearing_to_true_north,
    map_x_feet_for_storage,
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


@pytest.mark.parametrize(
    "raw,expected",
    [
        (45, 225),
        (89.9, 269.9),
        (134.9, 314.9),
        (225, 45),
        (314.9, 134.9),
        (44.9, 44.9),
        (135, 135),
        (224.9, 224.9),
        (315, 315),
    ],
)
def test_align_bearing_to_true_north_bands_boundary_behavior(raw, expected):
    """Band mode flips only bearings in [45,135) and [225,315)."""
    aligned = align_bearing_to_true_north(
        raw,
        offset_deg=0,
        apply_horizontal_flip=True,
        horizontal_mode="bands",
    )
    assert aligned == pytest.approx(expected % 360, abs=0.1)


@pytest.mark.parametrize(
    "raw,expected",
    [
        (44.9, 44.9),
        (45, 45),
        (90, 270),
        (134.9, 314.9),
        (135, 135),
        (225, 225),
        (270, 90),
        (314.9, 134.9),
        (315, 315),
    ],
)
def test_align_bearing_to_true_north_cones_boundary_behavior(raw, expected):
    """Cone mode flips only bearings within 45° of exactly 90° or 270°."""
    aligned = align_bearing_to_true_north(
        raw,
        offset_deg=0,
        apply_horizontal_flip=True,
        horizontal_mode="cones",
    )
    assert aligned == pytest.approx(expected % 360, abs=0.1)


def test_align_bearing_to_true_north_wraparound_negative_and_large_values():
    """Raw and offset values are normalized into [0, 360)."""
    assert align_bearing_to_true_north(-10, offset_deg=0, apply_horizontal_flip=False) == pytest.approx(350, abs=0.1)
    assert align_bearing_to_true_north(720, offset_deg=15, apply_horizontal_flip=False) == pytest.approx(15, abs=0.1)


def test_coordinate_mirror_x_default_true(monkeypatch):
    """By default, deployed coordinate storage mirrors X."""
    monkeypatch.delenv("COORDINATE_MIRROR_X", raising=False)
    assert map_x_feet_for_storage(10) == -10
    assert map_x_feet_for_storage(-8) == 8


def test_coordinate_mirror_x_env_override(monkeypatch):
    """COORDINATE_MIRROR_X can disable mirroring when needed."""
    monkeypatch.setenv("COORDINATE_MIRROR_X", "false")
    assert map_x_feet_for_storage(10) == 10
    assert map_x_feet_for_storage(-8) == -8