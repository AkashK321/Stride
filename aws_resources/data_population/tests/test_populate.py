import unittest
import math
from populate_floor_data import (
    calculate_bearing,
    calculate_distance,
    feet_to_pixels
)

class TestPopulateFunctions(unittest.TestCase):
    
    def test_feet_to_pixels(self):
        """Test coordinate conversion"""
        self.assertEqual(feet_to_pixels(0), 0)
        self.assertEqual(feet_to_pixels(10), 100)
        self.assertEqual(feet_to_pixels(5.5), 55)
    
    def test_calculate_bearing(self):
        """Test bearing calculation"""
        # North (straight up)
        self.assertAlmostEqual(calculate_bearing(0, 10, 0, 0), 0, places=1)
        
        # East (right)
        self.assertAlmostEqual(calculate_bearing(0, 0, 10, 0), 90, places=1)
        
        # South (down)
        self.assertAlmostEqual(calculate_bearing(0, 0, 0, 10), 180, places=1)
        
        # West (left)
        self.assertAlmostEqual(calculate_bearing(10, 0, 0, 0), 270, places=1)
    
    def test_calculate_distance(self):
        """Test distance calculation"""
        # 10 feet horizontal = 3.048 meters
        distance = calculate_distance(0, 0, 100, 0)  # 100 pixels = 10 feet
        self.assertAlmostEqual(distance, 3.048, places=2)
        
        # Pythagorean: 3-4-5 triangle (30-40-50 pixels = 3-4-5 feet)
        distance = calculate_distance(0, 0, 30, 40)
        expected = 5 * 0.3048  # 5 feet in meters
        self.assertAlmostEqual(distance, expected, places=2)

if __name__ == '__main__':
    unittest.main()