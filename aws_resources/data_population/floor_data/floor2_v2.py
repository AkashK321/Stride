"""
Generated v2 map data object for centerline migration.
"""

FLOOR2_DATA_V2 = {
    "building_id": "B01",
    "building_name": "BHEE",
    "floors": [
        {
            "floor_number": 2,
            "map_image_url": None,
            "map_scale_ratio": 0.03048,
            "nodes": [
                {
                    "id": "staircase_main_2S01",
                    "x_feet": 0,
                    "y_feet": 5.0,
                    "type": "Stairwell"
                },
                # {
                #     "id": "stair_west_corner",
                #     "x_feet": -13,
                #     "y_feet": 0,
                #     "type": "Intersection"
                # },
                # {
                #     "id": "stair_east_corner",
                #     "x_feet": 13,
                #     "y_feet": 0,
                #     "type": "Intersection"
                # },
                {
                    "id": "r226_door",
                    "x_feet": -28.0,
                    "y_feet": 5.0,
                    "type": "Door",
                    "node_meta": {
                        "door_id": "Room 226",
                        "side_canonical": "left",
                        "canonical_edge_start": "r226_door",
                        "canonical_edge_end": "staircase_main_2S01",
                        "door_normal_cardinal": "South"
                    }
                },
                {
                    "id": "r224_door",
                    "x_feet": -54.0,
                    "y_feet": 5.0,
                    "type": "Door",
                    "node_meta": {
                        "door_id": "Room 224",
                        "side_canonical": "left",
                        "canonical_edge_start": "r224_door",
                        "canonical_edge_end": "r226_door",
                        "door_normal_cardinal": "South"
                    }
                },
                {
                    "id": "r222_door",
                    "x_feet": -82.0,
                    "y_feet": 5.0,
                    "type": "Door",
                    "node_meta": {
                        "door_id": "Room 222",
                        "side_canonical": "left",
                        "canonical_edge_start": "r222_door",
                        "canonical_edge_end": "r224_door",
                        "door_normal_cardinal": "South"
                    }
                },
                {
                    "id": "southwest_corner",
                    "x_feet": -83.5,
                    "y_feet": 5.0,
                    "type": "Corner"
                },
                {
                    "id": "r220_door",
                    "x_feet": -83.5,
                    "y_feet": 5.0,
                    "type": "Door",
                    "node_meta": {
                        "door_id": "Room 220",
                        "side_canonical": "right",
                        "canonical_edge_start": "r220_door",
                        "canonical_edge_end": "r218_door",
                        "door_normal_cardinal": "West"
                    }
                },
                {
                    "id": "r218_door",
                    "x_feet": -83.5,
                    "y_feet": 14.0,
                    "type": "Door",
                    "node_meta": {
                        "door_id": "Room 218",
                        "side_canonical": "right",
                        "canonical_edge_start": "r218_door",
                        "canonical_edge_end": "r216_door",
                        "door_normal_cardinal": "West"
                    }
                },
                {
                    "id": "r216_door",
                    "x_feet": -83.5,
                    "y_feet": 42.0,
                    "type": "Door",
                    "node_meta": {
                        "door_id": "Room 216",
                        "side_canonical": "right",
                        "canonical_edge_start": "r216_door",
                        "canonical_edge_end": "r214_door",
                        "door_normal_cardinal": "West"
                    }
                },
                {
                    "id": "r214_door",
                    "x_feet": -83.5,
                    "y_feet": 45.0,
                    "type": "Door",
                    "node_meta": {
                        "door_id": "Room 214",
                        "side_canonical": "right",
                        "canonical_edge_start": "r214_door",
                        "canonical_edge_end": "r212_door",
                        "door_normal_cardinal": "West"
                    }
                },
                # {
                #     "id": "vend_south_corner",
                #     "x_feet": -83.5,
                #     "y_feet": 56,
                #     "type": "Intersection"
                # },
                {
                    "id": "r212_door",
                    "x_feet": -83.5,
                    "y_feet": 56.0,
                    "type": "Door",
                    "node_meta": {
                        "door_id": "Room 212",
                        "side_canonical": "left",
                        "canonical_edge_start": "r212_door",
                        "canonical_edge_end": "r206_door",
                        "door_normal_cardinal": "West"
                    }
                },
                {
                    "id": "staircase_west_2S03",
                    "x_feet": -83.5,
                    "y_feet": 66,
                    "type": "Stairwell"
                },
                # {
                #     "id": "hallway_Bside",
                #     "x_feet": -83.5,
                #     "y_feet": 72,
                #     "type": "Intersection"
                # },
                {
                    "id": "r206_door",
                    "x_feet": -83.5,
                    "y_feet": 56.0,
                    "type": "Door",
                    "node_meta": {
                        "door_id": "Room 206",
                        "side_canonical": "left",
                        "canonical_edge_start": "r206_door",
                        "canonical_edge_end": "r207_door",
                        "door_normal_cardinal": "West"
                    }
                },
                {
                    "id": "r207_door",
                    "x_feet": -83.5,
                    "y_feet": 56.0,
                    "type": "Door",
                    "node_meta": {
                        "door_id": "Room 207",
                        "side_canonical": "left",
                        "canonical_edge_start": "r207_door",
                        "canonical_edge_end": "vend_south_corner",
                        "door_normal_cardinal": "West"
                    }
                },
                {
                    "id": "r209_door",
                    "x_feet": -83.5,
                    "y_feet": 106.0,
                    "type": "Door",
                    "node_meta": {
                        "door_id": "Room 209",
                        "side_canonical": "right",
                        "canonical_edge_start": "r209_door",
                        "canonical_edge_end": "r211_door",
                        "door_normal_cardinal": "East"
                    }
                },
                {
                    "id": "r211_door",
                    "x_feet": -83.5,
                    "y_feet": 71.0,
                    "type": "Door",
                    "node_meta": {
                        "door_id": "Room 211",
                        "side_canonical": "right",
                        "canonical_edge_start": "r211_door",
                        "canonical_edge_end": "r215_door",
                        "door_normal_cardinal": "East"
                    }
                },
                {
                    "id": "r215_door",
                    "x_feet": -83.5,
                    "y_feet": 62.0,
                    "type": "Door",
                    "node_meta": {
                        "door_id": "Room 215",
                        "side_canonical": "right",
                        "canonical_edge_start": "r215_door",
                        "canonical_edge_end": "r217_door",
                        "door_normal_cardinal": "East"
                    }
                },
                {
                    "id": "r217_door",
                    "x_feet": -83.5,
                    "y_feet": 32.0,
                    "type": "Door",
                    "node_meta": {
                        "door_id": "Room 217",
                        "side_canonical": "right",
                        "canonical_edge_start": "r217_door",
                        "canonical_edge_end": "r221_door",
                        "door_normal_cardinal": "East"
                    }
                },
                {
                    "id": "r221_door",
                    "x_feet": -83.5,
                    "y_feet": 21.0,
                    "type": "Door",
                    "node_meta": {
                        "door_id": "Room 221",
                        "side_canonical": "right",
                        "canonical_edge_start": "r221_door",
                        "canonical_edge_end": "r219_door",
                        "door_normal_cardinal": "East"
                    }
                },
                {
                    "id": "r219_door",
                    "x_feet": -83.5,
                    "y_feet": 14.0,
                    "type": "Door",
                    "node_meta": {
                        "door_id": "Men's Restroom 219",
                        "side_canonical": "right",
                        "canonical_edge_start": "r219_door",
                        "canonical_edge_end": "r225_door",
                        "door_normal_cardinal": "East"
                    }
                },
                {
                    "id": "r225_door",
                    "x_feet": -83.5,
                    "y_feet": 9.0,
                    "type": "Door",
                    "node_meta": {
                        "door_id": "Room 225",
                        "side_canonical": "left",
                        "canonical_edge_start": "r225_door",
                        "canonical_edge_end": "inner_west_hall_south",
                        "door_normal_cardinal": "East"
                    }
                },
                {
                    "id": "r237_door",
                    "x_feet": 68.8,
                    "y_feet": 5.0,
                    "type": "Door",
                    "node_meta": {
                        "door_id": "Room 237",
                        "side_canonical": "right",
                        "canonical_edge_start": "r237_door",
                        "canonical_edge_end": "southeast_corner",
                        "door_normal_cardinal": "East"
                    }
                },
                {
                    "id": "elevator_2e01",
                    "x_feet": 82.8,
                    "y_feet": 14.6,
                    "type": "Elevator"
                },
                {
                    "id": "r241_door",
                    "x_feet": 82.8,
                    "y_feet": 20.6,
                    "type": "Door",
                    "node_meta": {
                        "door_id": "Room 241",
                        "side_canonical": "left",
                        "canonical_edge_start": "r241_door",
                        "canonical_edge_end": "r241a_door",
                        "door_normal_cardinal": "East"
                    }
                },
                {
                    "id": "r241a_door",
                    "x_feet": 82.8,
                    "y_feet": 34.2,
                    "type": "Door",
                    "node_meta": {
                        "door_id": "Room 241A",
                        "side_canonical": "left",
                        "canonical_edge_start": "r241a_door",
                        "canonical_edge_end": "r241a_door",
                        "door_normal_cardinal": "East"
                    }
                },
                {
                    "id": "r230_door",
                    "x_feet": 18.0,
                    "y_feet": 5.0,
                    "type": "Door",
                    "node_meta": {
                        "door_id": "Room 230",
                        "side_canonical": "left",
                        "canonical_edge_start": "r230_door",
                        "canonical_edge_end": "r232_door",
                        "door_normal_cardinal": "South"
                    }
                },
                {
                    "id": "r232_door",
                    "x_feet": 27.0,
                    "y_feet": 5.0,
                    "type": "Door",
                    "node_meta": {
                        "door_id": "Room 232",
                        "side_canonical": "left",
                        "canonical_edge_start": "r232_door",
                        "canonical_edge_end": "r234_door",
                        "door_normal_cardinal": "South"
                    }
                },
                {
                    "id": "r234_door",
                    "x_feet": 38.0,
                    "y_feet": 5.0,
                    "type": "Door",
                    "node_meta": {
                        "door_id": "Room 234",
                        "side_canonical": "left",
                        "canonical_edge_start": "r234_door",
                        "canonical_edge_end": "r236_door",
                        "door_normal_cardinal": "South"
                    }
                },
                {
                    "id": "r236_door",
                    "x_feet": 64.0,
                    "y_feet": 5.0,
                    "type": "Door",
                    "node_meta": {
                        "door_id": "Room 236",
                        "side_canonical": "left",
                        "canonical_edge_start": "r236_door",
                        "canonical_edge_end": "southeast_corner",
                        "door_normal_cardinal": "South"
                    }
                },
                {
                    "id": "southeast_corner",
                    "x_feet": 82.8,
                    "y_feet": 5.0,
                    "type": "Corner"
                },
                {
                    "id": "r238_door",
                    "x_feet": 82.8,
                    "y_feet": 5.0,
                    "type": "Door",
                    "node_meta": {
                        "door_id": "Room 238",
                        "side_canonical": "left",
                        "canonical_edge_start": "r238_door",
                        "canonical_edge_end": "r240_door",
                        "door_normal_cardinal": "East"
                    }
                },
                {
                    "id": "r240_door",
                    "x_feet": 82.8,
                    "y_feet": 13.8,
                    "type": "Door",
                    "node_meta": {
                        "door_id": "Room 240",
                        "side_canonical": "left",
                        "canonical_edge_start": "r240_door",
                        "canonical_edge_end": "r240a_door",
                        "door_normal_cardinal": "East"
                    }
                },
                {
                    "id": "r240a_door",
                    "x_feet": 82.8,
                    "y_feet": 20.2,
                    "type": "Door",
                    "node_meta": {
                        "door_id": "Room 240A",
                        "side_canonical": "left",
                        "canonical_edge_start": "r240a_door",
                        "canonical_edge_end": "hallway_MSEEcrossing",
                        "door_normal_cardinal": "East"
                    }
                },
                {
                    "id": "hallway_MSEEcrossing",
                    "x_feet": 82.8,
                    "y_feet": 25.8,
                    "type": "Intersection"
                },
                {
                    "id": "r242_door",
                    "x_feet": 82.8,
                    "y_feet": 43.4,
                    "type": "Door",
                    "node_meta": {
                        "door_id": "Room 242",
                        "side_canonical": "left",
                        "canonical_edge_start": "r242_door",
                        "canonical_edge_end": "r244_door",
                        "door_normal_cardinal": "East"
                    }
                },
                {
                    "id": "r244_door",
                    "x_feet": 82.8,
                    "y_feet": 51.4,
                    "type": "Door",
                    "node_meta": {
                        "door_id": "Room 244",
                        "side_canonical": "left",
                        "canonical_edge_start": "r244_door",
                        "canonical_edge_end": "staircase_east_2S02",
                        "door_normal_cardinal": "East"
                    }
                },
                {
                    "id": "staircase_east_2S02",
                    "x_feet": 82.8,
                    "y_feet": 59.4,
                    "type": "Stairwell"
                },
                {
                    "id": "r243_door",
                    "x_feet": 82.8,
                    "y_feet": 73.0,
                    "type": "Door",
                    "node_meta": {
                        "door_id": "Women's Restroom 243",
                        "side_canonical": "left",
                        "canonical_edge_start": "r243_door",
                        "canonical_edge_end": "r245_door",
                        "door_normal_cardinal": "East"
                    }
                },
                {
                    "id": "r245_door",
                    "x_feet": 82.8,
                    "y_feet": 83.4,
                    "type": "Door",
                    "node_meta": {
                        "door_id": "Men's Restroom 245",
                        "side_canonical": "left",
                        "canonical_edge_start": "r245_door",
                        "canonical_edge_end": "offices_door",
                        "door_normal_cardinal": "East"
                    }
                },
                {
                    "id": "offices_door",
                    "x_feet": 82.8,
                    "y_feet": 96.0,
                    "type": "Door",
                    "node_meta": {
                        "door_id": "Office Wing",
                        "side_canonical": "left",
                        "canonical_edge_start": "offices_door",
                        "canonical_edge_end": "east_office_hall_mid",
                        "door_normal_cardinal": "West"
                    }
                },
                # {
                #     "id": "inner_west_hall_north",
                #     "x_feet": -83.5,
                #     "y_feet": 110,
                #     "type": "Intersection"
                # },
                {
                    "id": "inner_west_hall_south",
                    "x_feet": -83.5,
                    "y_feet": 9,
                    "type": "Intersection"
                },
                # {
                #     "id": "west_cross_north",
                #     "x_feet": -88.0,
                #     "y_feet": 110,
                #     "type": "Intersection"
                # },
                {
                    "id": "east_inner_south",
                    "x_feet": 82.8,
                    "y_feet": 9,
                    "type": "Intersection"
                },
                # {
                #     "id": "west_cross_south",
                #     "x_feet": -92.5,
                #     "y_feet": 9,
                #     "type": "Intersection"
                # },
                {
                    "id": "east_office_hall_mid",
                    "x_feet": 82.8,
                    "y_feet": 96,
                    "type": "Intersection"
                }
            ],
            "edges": [
                {
                    "start": "southwest_corner",
                    "end": "r222_door",
                    "bidirectional": True
                },
                {
                    "start": "r222_door",
                    "end": "r224_door",
                    "bidirectional": True
                },
                {
                    "start": "r224_door",
                    "end": "r226_door",
                    "bidirectional": True
                },
                {
                    "start": "r226_door",
                    "end": "staircase_main_2S01",
                    "bidirectional": True
                },
                {
                    "start": "staircase_main_2S01",
                    "end": "r230_door",
                    "bidirectional": True
                },
                {
                    "start": "r230_door",
                    "end": "r232_door",
                    "bidirectional": True
                },
                {
                    "start": "r232_door",
                    "end": "r234_door",
                    "bidirectional": True
                },
                {
                    "start": "r234_door",
                    "end": "r236_door",
                    "bidirectional": True
                },
                {
                    "start": "r236_door",
                    "end": "r237_door",
                    "bidirectional": True
                },
                {
                    "start": "southwest_corner",
                    "end": "r220_door",
                    "bidirectional": True
                },
                {
                    "start": "r220_door",
                    "end": "r218_door",
                    "bidirectional": True
                },
                {
                    "start": "r218_door",
                    "end": "r216_door",
                    "bidirectional": True
                },
                {
                    "start": "r216_door",
                    "end": "r214_door",
                    "bidirectional": True
                },
                {
                    "start": "r214_door",
                    "end": "r212_door",
                    "bidirectional": True
                },
                {
                    "start": "r212_door",
                    "end": "r206_door",
                    "bidirectional": True
                },
                {
                    "start": "r206_door",
                    "end": "r207_door",
                    "bidirectional": True
                },
                {
                    "start": "r207_door",
                    "end": "vend_south_corner",
                    "bidirectional": True
                },
                {
                    "start": "vend_south_corner",
                    "end": "staircase_west_2S03",
                    "bidirectional": True
                },
                {
                    "start": "staircase_west_2S03",
                    "end": "hallway_Bside",
                    "bidirectional": True
                },
                {
                    "start": "hallway_Bside",
                    "end": "r208_door",
                    "bidirectional": True
                },
                {
                    "start": "r208_door",
                    "end": "west_cross_north",
                    "bidirectional": True
                },
                {
                    "start": "west_cross_north",
                    "end": "inner_west_hall_north",
                    "bidirectional": True
                },
                # {
                #     "start": "inner_west_hall_north",
                #     "end": "r209_door",
                #     "bidirectional": True
                # },
                {
                    "start": "r209_door",
                    "end": "r211_door",
                    "bidirectional": True
                },
                {
                    "start": "r211_door",
                    "end": "r215_door",
                    "bidirectional": True
                },
                {
                    "start": "r215_door",
                    "end": "r217_door",
                    "bidirectional": True
                },
                {
                    "start": "r217_door",
                    "end": "r221_door",
                    "bidirectional": True
                },
                {
                    "start": "r221_door",
                    "end": "r219_door",
                    "bidirectional": True
                },
                {
                    "start": "r219_door",
                    "end": "r225_door",
                    "bidirectional": True
                },
                {
                    "start": "r225_door",
                    "end": "inner_west_hall_south",
                    "bidirectional": True
                },
                {
                    "start": "inner_west_hall_south",
                    "end": "west_cross_south",
                    "bidirectional": True
                },
                {
                    "start": "southeast_corner",
                    "end": "r238_door",
                    "bidirectional": True
                },
                {
                    "start": "r238_door",
                    "end": "r240_door",
                    "bidirectional": True
                },
                {
                    "start": "r240_door",
                    "end": "r240a_door",
                    "bidirectional": True
                },
                {
                    "start": "r240a_door",
                    "end": "hallway_MSEEcrossing",
                    "bidirectional": True
                },
                {
                    "start": "hallway_MSEEcrossing",
                    "end": "r242_door",
                    "bidirectional": True
                },
                {
                    "start": "r242_door",
                    "end": "r244_door",
                    "bidirectional": True
                },
                {
                    "start": "r244_door",
                    "end": "staircase_east_2S02",
                    "bidirectional": True
                },
                {
                    "start": "staircase_east_2S02",
                    "end": "r243_door",
                    "bidirectional": True
                },
                {
                    "start": "r243_door",
                    "end": "r245_door",
                    "bidirectional": True
                },
                {
                    "start": "r245_door",
                    "end": "offices_door",
                    "bidirectional": True
                },
                {
                    "start": "offices_door",
                    "end": "east_office_hall_mid",
                    "bidirectional": True
                },
                # {
                #     "start": "r237_door",
                #     "end": "r237_door",
                #     "bidirectional": True
                # },
                {
                    "start": "r237_door",
                    "end": "southeast_corner",
                    "bidirectional": True
                },
                {
                    "start": "east_inner_south",
                    "end": "elevator_2e01",
                    "bidirectional": True
                },
                {
                    "start": "elevator_2e01",
                    "end": "r241_door",
                    "bidirectional": True
                },
                {
                    "start": "r241_door",
                    "end": "r241a_door",
                    "bidirectional": True
                },
                {
                    "start": "r241a_door",
                    "end": "r241a_door",
                    "bidirectional": True
                },
                # {
                #     "start": "staircase_main_2S01",
                #     "end": "stair_west_corner",
                #     "bidirectional": True
                # },
                # {
                #     "start": "staircase_main_2S01",
                #     "end": "stair_east_corner",
                #     "bidirectional": True
                # },
                {
                    "start": "west_cross_south",
                    "end": "southwest_corner",
                    "bidirectional": True
                },
                # {
                #     "start": "r225_door",
                #     "end": "r237_door",
                #     "bidirectional": True
                # }
            ],
            "landmarks": [
                {
                    "name": "Room 226",
                    "x_feet": -28,
                    "y_feet": -5,
                    "nearest_node": "r226_door",
                    "bearing": "South"
                },
                {
                    "name": "Room 224",
                    "x_feet": -54,
                    "y_feet": -5,
                    "nearest_node": "r224_door",
                    "bearing": "South"
                },
                {
                    "name": "Room 222",
                    "x_feet": -82,
                    "y_feet": -5,
                    "nearest_node": "r222_door",
                    "bearing": "South"
                },
                {
                    "name": "Room 220",
                    "x_feet": -93,
                    "y_feet": 4,
                    "nearest_node": "r220_door",
                    "bearing": "West"
                },
                {
                    "name": "Room 218",
                    "x_feet": -93,
                    "y_feet": 14,
                    "nearest_node": "r218_door",
                    "bearing": "West"
                },
                {
                    "name": "Room 216",
                    "x_feet": -93,
                    "y_feet": 42,
                    "nearest_node": "r216_door",
                    "bearing": "West"
                },
                {
                    "name": "Room 214",
                    "x_feet": -93,
                    "y_feet": 45,
                    "nearest_node": "r214_door",
                    "bearing": "West"
                },
                {
                    "name": "Room 212",
                    "x_feet": -93,
                    "y_feet": 56,
                    "nearest_node": "r212_door",
                    "bearing": "West"
                },
                {
                    "name": "Room 208",
                    "x_feet": -93,
                    "y_feet": 96,
                    "nearest_node": "r208_door",
                    "bearing": "West"
                },
                {
                    "name": "Room 206",
                    "x_feet": -93,
                    "y_feet": 56,
                    "nearest_node": "r206_door",
                    "bearing": "West"
                },
                {
                    "name": "Room 207",
                    "x_feet": -93,
                    "y_feet": 56,
                    "nearest_node": "r207_door",
                    "bearing": "West"
                },
                {
                    "name": "Room 209",
                    "x_feet": -74,
                    "y_feet": 106,
                    "nearest_node": "r209_door",
                    "bearing": "East"
                },
                {
                    "name": "Room 211",
                    "x_feet": -74,
                    "y_feet": 71,
                    "nearest_node": "r211_door",
                    "bearing": "East"
                },
                {
                    "name": "Room 215",
                    "x_feet": -74,
                    "y_feet": 62,
                    "nearest_node": "r215_door",
                    "bearing": "East"
                },
                {
                    "name": "Room 217",
                    "x_feet": -74,
                    "y_feet": 32,
                    "nearest_node": "r217_door",
                    "bearing": "East"
                },
                {
                    "name": "Room 221",
                    "x_feet": -74,
                    "y_feet": 21,
                    "nearest_node": "r221_door",
                    "bearing": "East"
                },
                {
                    "name": "Men's Restroom 219",
                    "x_feet": -74,
                    "y_feet": 14,
                    "nearest_node": "r219_door",
                    "bearing": "East"
                },
                {
                    "name": "Room 225",
                    "x_feet": -55,
                    "y_feet": 9,
                    "nearest_node": "r225_door",
                    "bearing": "East"
                },
                {
                    "name": "Room 230",
                    "x_feet": 18,
                    "y_feet": -5,
                    "nearest_node": "r230_door",
                    "bearing": "South"
                },
                {
                    "name": "Room 232",
                    "x_feet": 27,
                    "y_feet": -5,
                    "nearest_node": "r232_door",
                    "bearing": "South"
                },
                {
                    "name": "Room 234",
                    "x_feet": 38,
                    "y_feet": -5,
                    "nearest_node": "r234_door",
                    "bearing": "South"
                },
                {
                    "name": "Room 236",
                    "x_feet": 64,
                    "y_feet": -5,
                    "nearest_node": "r236_door",
                    "bearing": "South"
                },
                {
                    "name": "Room 238",
                    "x_feet": 93,
                    "y_feet": 3,
                    "nearest_node": "r238_door",
                    "bearing": "East"
                },
                {
                    "name": "Room 240",
                    "x_feet": 93,
                    "y_feet": 13.8,
                    "nearest_node": "r240_door",
                    "bearing": "East"
                },
                {
                    "name": "Room 240A",
                    "x_feet": 93,
                    "y_feet": 20.2,
                    "nearest_node": "r240a_door",
                    "bearing": "East"
                },
                {
                    "name": "Room 242",
                    "x_feet": 93,
                    "y_feet": 43.4,
                    "nearest_node": "r242_door",
                    "bearing": "East"
                },
                {
                    "name": "Room 244",
                    "x_feet": 93,
                    "y_feet": 51.4,
                    "nearest_node": "r244_door",
                    "bearing": "East"
                },
                {
                    "name": "Women's Restroom 243",
                    "x_feet": 93,
                    "y_feet": 73,
                    "nearest_node": "r243_door",
                    "bearing": "East"
                },
                {
                    "name": "Men's Restroom 245",
                    "x_feet": 93,
                    "y_feet": 83.4,
                    "nearest_node": "r245_door",
                    "bearing": "East"
                },
                {
                    "name": "Room 237",
                    "x_feet": 68.6,
                    "y_feet": 14,
                    "nearest_node": "r237_door",
                    "bearing": "East"
                },
                {
                    "name": "Elevator 2E01",
                    "x_feet": 77.6,
                    "y_feet": 14.6,
                    "nearest_node": "elevator_2e01",
                    "bearing": "North"
                },
                {
                    "name": "Room 241",
                    "x_feet": 82.6,
                    "y_feet": 22.6,
                    "nearest_node": "r241_door",
                    "bearing": "East"
                },
                {
                    "name": "Room 241A",
                    "x_feet": 82.6,
                    "y_feet": 36.2,
                    "nearest_node": "r241a_door",
                    "bearing": "East"
                },
                {
                    "name": "Main Staircase",
                    "x_feet": 0,
                    "y_feet": 0,
                    "nearest_node": "staircase_main_2S01",
                    "bearing": "North"
                },
                {
                    "name": "West Staircase",
                    "x_feet": -88,
                    "y_feet": 66,
                    "nearest_node": "staircase_west_2S03",
                    "bearing": "North"
                },
                {
                    "name": "East Staircase",
                    "x_feet": 88,
                    "y_feet": 59.4,
                    "nearest_node": "staircase_east_2S02",
                    "bearing": "North"
                },
                {
                    "name": "Office Wing",
                    "x_feet": 78,
                    "y_feet": 96.2,
                    "nearest_node": "offices_door",
                    "bearing": "West"
                },
                {
                    "name": "Vending Machines",
                    "x_feet": -88,
                    "y_feet": 56,
                    "nearest_node": "vend_south_corner",
                    "bearing": "West"
                },
                {
                    "name": "Main Hallway",
                    "x_feet": 0,
                    "y_feet": 0,
                    "nearest_node": "staircase_main_2S01",
                    "bearing": "South"
                },
                {
                    "name": "Building B Connection",
                    "x_feet": -88,
                    "y_feet": 72,
                    "nearest_node": "hallway_Bside",
                    "bearing": "North"
                },
                {
                    "name": "MSEE Connection",
                    "x_feet": 88,
                    "y_feet": 25.8,
                    "nearest_node": "hallway_MSEEcrossing",
                    "bearing": "East"
                }
            ]
        }
    ]
}
