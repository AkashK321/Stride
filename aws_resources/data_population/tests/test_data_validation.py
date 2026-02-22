
import unittest
from floor_data.floor2 import FLOOR2_DATA

class TestFloor2Data(unittest.TestCase):
    
    def test_building_has_required_fields(self):
        """Test building data structure"""
        self.assertIn('building_id', FLOOR2_DATA)
        self.assertIn('building_name', FLOOR2_DATA)
        self.assertIn('floors', FLOOR2_DATA)
    
    def test_no_duplicate_node_ids(self):
        """Test that node IDs are unique"""
        for floor in FLOOR2_DATA['floors']:
            node_ids = [n['id'] for n in floor['nodes']]
            self.assertEqual(len(node_ids), len(set(node_ids)), 
                           "Node IDs must be unique")
    
    def test_edges_reference_valid_nodes(self):
        """Test that all edges reference existing nodes"""
        for floor in FLOOR2_DATA['floors']:
            node_ids = {n['id'] for n in floor['nodes']}
            for edge in floor['edges']:
                self.assertIn(edge['start'], node_ids, 
                            f"Edge start '{edge['start']}' not in nodes")
                self.assertIn(edge['end'], node_ids, 
                            f"Edge end '{edge['end']}' not in nodes")
    
    def test_landmarks_reference_valid_nodes(self):
        """Test that all landmarks reference existing nodes"""
        for floor in FLOOR2_DATA['floors']:
            node_ids = {n['id'] for n in floor['nodes']}
            for landmark in floor['landmarks']:
                if landmark.get('nearest_node'):
                    self.assertIn(landmark['nearest_node'], node_ids,
                                f"Landmark '{landmark['name']}' references invalid node")
    
    def test_no_spaces_in_node_ids(self):
        """Test that node IDs don't contain spaces"""
        for floor in FLOOR2_DATA['floors']:
            for node in floor['nodes']:
                self.assertNotIn(' ', node['id'], 
                               f"Node ID '{node['id']}' contains space")

if __name__ == '__main__':
    unittest.main()