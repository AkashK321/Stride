import pytest

from floor_data.floor2_v2 import FLOOR2_DATA_V2 as FLOOR2_DATA


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
    required = ['start', 'end', 'bidirectional', 'bearing_deg', 'rev_bearing_deg']
    for floor in FLOOR2_DATA['floors']:
        for edge in floor['edges']:
            for field in required:
                assert field in edge, \
                    f"Edge missing field '{field}'"


def test_all_landmarks_have_required_fields():
    """Test that all landmarks have required fields"""
    required = ['name', 'x_feet', 'y_feet', 'nearest_node', 'door_id']
    for floor in FLOOR2_DATA['floors']:
        for landmark in floor['landmarks']:
            for field in required:
                assert field in landmark, \
                    f"Landmark '{landmark.get('name', 'UNKNOWN')}' missing field '{field}'"


def test_valid_node_types():
    """Test that node types are valid"""
    valid_types = {'Intersection', 'Corner', 'Elevator', 'Stairwell', 'Door', 'HallwayPoint'}
    for floor in FLOOR2_DATA['floors']:
        for node in floor['nodes']:
            assert node['type'] in valid_types, \
                f"Node '{node['id']}' has invalid type '{node['type']}'"


def test_edge_reverse_bearings_are_opposites():
    """Reverse bearing should be exactly +180 mod 360."""
    for floor in FLOOR2_DATA['floors']:
        for edge in floor['edges']:
            fwd = float(edge['bearing_deg']) % 360.0
            rev = float(edge['rev_bearing_deg']) % 360.0
            assert rev == pytest.approx((fwd + 180.0) % 360.0, abs=1e-6), \
                f"Edge {edge['start']}->{edge['end']} has invalid reverse bearing"


def test_coordinates_are_numeric():
    """Test that coordinates are numbers"""
    for floor in FLOOR2_DATA['floors']:
        for node in floor['nodes']:
            assert isinstance(node['x_feet'], (int, float)), \
                f"Node '{node['id']}' x_feet is not numeric"
            assert isinstance(node['y_feet'], (int, float)), \
                f"Node '{node['id']}' y_feet is not numeric"


def test_hallwaypoint_doors_have_side_by_bearing():
    """HallwayPoint doors should include side_by_bearing maps."""
    for floor in FLOOR2_DATA['floors']:
        for node in floor['nodes']:
            if node.get('type') != 'HallwayPoint':
                continue
            for door in node.get('doors', []):
                assert 'id' in door
                assert 'label' in door
                assert 'side_by_bearing' in door
                assert len(door['side_by_bearing']) > 0
                for side_entry in door['side_by_bearing']:
                    assert side_entry.get('side') in {'left', 'right'}
                    assert isinstance(side_entry.get('bearing_deg'), (int, float))


def test_landmark_door_id_exists_on_nearest_node():
    """Every landmark door_id must exist on nearest node doors."""
    for floor in FLOOR2_DATA['floors']:
        nodes_by_id = {n['id']: n for n in floor['nodes']}
        for landmark in floor['landmarks']:
            door_id = landmark.get('door_id')
            assert door_id is not None, \
                f"Landmark '{landmark['name']}' must define door_id"
            nearest = nodes_by_id.get(landmark['nearest_node'])
            assert nearest is not None
            door_ids = {door.get('id') for door in nearest.get('doors', [])}
            assert door_id in door_ids, \
                f"Landmark '{landmark['name']}' has unknown door_id '{door_id}' at node '{landmark['nearest_node']}'"
