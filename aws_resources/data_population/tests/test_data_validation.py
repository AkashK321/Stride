import pytest
from floor_data.floor2 import FLOOR2_DATA


def test_building_has_required_fields():
    """Test building data structure"""
    assert 'building_id' in FLOOR2_DATA
    assert 'building_name' in FLOOR2_DATA
    assert 'floors' in FLOOR2_DATA
    assert FLOOR2_DATA['building_id'] == 'B01'
    assert FLOOR2_DATA['building_name'] == 'BHEE'


def test_floors_is_list():
    """Test floors is a list"""
    assert isinstance(FLOOR2_DATA['floors'], list)
    assert len(FLOOR2_DATA['floors']) > 0


def test_floor_has_required_fields():
    """Test floor data structure"""
    floor = FLOOR2_DATA['floors'][0]
    assert 'floor_number' in floor
    assert 'nodes' in floor
    assert 'edges' in floor
    assert 'landmarks' in floor


def test_no_duplicate_node_ids():
    """Test that node IDs are unique"""
    for floor in FLOOR2_DATA['floors']:
        node_ids = [n['id'] for n in floor['nodes']]
        assert len(node_ids) == len(set(node_ids)), \
            f"Duplicate node IDs found: {[x for x in node_ids if node_ids.count(x) > 1]}"


def test_no_spaces_in_node_ids():
    """Test that node IDs don't contain spaces"""
    for floor in FLOOR2_DATA['floors']:
        for node in floor['nodes']:
            assert ' ' not in node['id'], \
                f"Node ID '{node['id']}' contains space"


def test_edges_reference_valid_nodes():
    """Test that all edges reference existing nodes"""
    for floor in FLOOR2_DATA['floors']:
        node_ids = {n['id'] for n in floor['nodes']}
        for edge in floor['edges']:
            assert edge['start'] in node_ids, \
                f"Edge start '{edge['start']}' not in nodes"
            assert edge['end'] in node_ids, \
                f"Edge end '{edge['end']}' not in nodes"


def test_landmarks_reference_valid_nodes():
    """Test that all landmarks reference existing nodes"""
    for floor in FLOOR2_DATA['floors']:
        node_ids = {n['id'] for n in floor['nodes']}
        for landmark in floor['landmarks']:
            if landmark.get('nearest_node'):
                assert landmark['nearest_node'] in node_ids, \
                    f"Landmark '{landmark['name']}' references invalid node '{landmark['nearest_node']}'"


def test_all_nodes_have_required_fields():
    """Test that all nodes have required fields"""
    required = ['id', 'x_feet', 'y_feet', 'type']
    for floor in FLOOR2_DATA['floors']:
        for node in floor['nodes']:
            for field in required:
                assert field in node, \
                    f"Node '{node.get('id', 'UNKNOWN')}' missing field '{field}'"


def test_all_edges_have_required_fields():
    """Test that all edges have required fields"""
    required = ['start', 'end', 'bidirectional']
    for floor in FLOOR2_DATA['floors']:
        for edge in floor['edges']:
            for field in required:
                assert field in edge, \
                    f"Edge missing field '{field}'"


def test_all_landmarks_have_required_fields():
    """Test that all landmarks have required fields"""
    required = ['name', 'x_feet', 'y_feet', 'nearest_node', 'bearing']
    for floor in FLOOR2_DATA['floors']:
        for landmark in floor['landmarks']:
            for field in required:
                assert field in landmark, \
                    f"Landmark '{landmark.get('name', 'UNKNOWN')}' missing field '{field}'"


def test_valid_node_types():
    """Test that node types are valid"""
    valid_types = {'Intersection', 'Corner', 'Elevator', 'Stairwell', 'Door'}
    for floor in FLOOR2_DATA['floors']:
        for node in floor['nodes']:
            assert node['type'] in valid_types, \
                f"Node '{node['id']}' has invalid type '{node['type']}'"


def test_valid_bearings():
    """Test that bearings are valid compass directions"""
    valid_bearings = {'North', 'South', 'East', 'West'}
    for floor in FLOOR2_DATA['floors']:
        for landmark in floor['landmarks']:
            assert landmark['bearing'] in valid_bearings, \
                f"Landmark '{landmark['name']}' has invalid bearing '{landmark['bearing']}'"


def test_coordinates_are_numeric():
    """Test that coordinates are numbers"""
    for floor in FLOOR2_DATA['floors']:
        for node in floor['nodes']:
            assert isinstance(node['x_feet'], (int, float)), \
                f"Node '{node['id']}' x_feet is not numeric"
            assert isinstance(node['y_feet'], (int, float)), \
                f"Node '{node['id']}' y_feet is not numeric"
