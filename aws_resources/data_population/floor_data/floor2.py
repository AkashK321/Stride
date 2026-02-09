'''

'''

FLOOR2_DATA = {
    'building_id': 'B01',
    'building_name': 'BHEE',
    # 'gps_lat":
    # 'gps_long':
    
    'floors': [  
    {
        'floor_number': 2, 
        'map_image_url': None,
        'map_scale_ratio': 0.03048, # might remove in the future
        'nodes': [
            # Lower horizontal  
            {
                'id': 'staircase_main_2S01',
                        'x_feet': 0,
                        'y_feet': 0,
                        'type': 'Stairwell'
            },
                # west corner of the staircase
            {
                'id': 'stair_west_corner',
                        'x_feet': -13, 
                        'y_feet': 0,
                        'type': 'Intersection'
            },
            
                # east corner of the staircase
            {
                'id': 'stair_east_corner',
                        'x_feet': 13, 
                        'y_feet': 0,
                        'type': 'Intersection'
            },
            
                # Room 226
            {
                'id': 'r226_door',
                        'x_feet': -28,
                        'y_feet': 0,  # 15 feet south of origin
                        'type': 'Door'
            },
                # Room 224
            {
                'id': 'r224_door',
                        'x_feet': -54,
                        'y_feet': 0, 
                        'type': 'Door'
            },
            
                # Room 222
            {
                'id': 'r222_door',
                        'x_feet': -82,
                        'y_feet': 0, 
                        'type': 'Door'
            },
            
            
                # southwest corner of main building / building B isn't considered
            {
                'id': 'southwest_corner',
                        'x_feet': -88, 
                        'y_feet': 0,
                        'type': 'Corner'
            },
            
                # Room 220
            {
                'id': 'r220_door',
                        'x_feet': -88,
                        'y_feet': 4, 
                        'type': 'Door'
            },
            
                # Room 218
            {
                'id': 'r218_door',
                        'x_feet': -88,
                        'y_feet': 14, 
                        'type': 'Door'
            },
            
                # Room 216
            {
                'id': 'r216_door',
                        'x_feet': -88,
                        'y_feet': 42, 
                        'type': 'Door'
            },
            
                # Room 214
            {
                'id': 'r214_door',
                        'x_feet': -88,
                        'y_feet': 45, 
                        'type': 'Door'
            },
            
                # vending machine south corner 
            {
                'id': 'vend_south corner',
                        'x_feet': -88, 
                        'y_feet': 56,
                        'type': 'Intersection'
            },
            
                # Room 212 TO DO
            {
                'id': 'r212_door',
                        'x_feet': 90, # TO DO
                        'y_feet': 56, 
                        'type': 'Door'
            },
            
                # West staircase south corner
            {
                'id': 'staircase_west_2S03',
                        'x_feet': -88,
                        'y_feet': 66,
                        'type': 'Stairwell'
            },
            
                # Hallway B side
            {
                'id': 'hallway_Bside',
                        'x_feet': -88,
                        'y_feet': 72,
                        'type': 'Intersection'
            },
            
                # Room 208
            {
                'id': 'r208_door',
                        'x_feet': -88,
                        'y_feet': 96, 
                        'type': 'Door'
            },
            
                # Room 206 TO DO
            {
                'id': 'r206_door',
                        'x_feet': -88, # TO DO
                        'y_feet': 56, # TO DO
                        'type': 'Door'
            },
            
                # Room 207 TO DO
            {
                'id': 'r207_door',
                        'x_feet': -88, # TO DO
                        'y_feet': 56, # TO DO
                        'type': 'Door'
            },
            
            # Inner West 
            
                # Room 209
            {
                'id': 'r209_door',
                        'x_feet': -79, 
                        'y_feet': 106, 
                        'type': 'Door'
            },
            
                # Room 211
            {
                'id': 'r211_door',
                        'x_feet': -79, 
                        'y_feet': 71, 
                        'type': 'Door'
            },
            
                # Room 215
            {
                'id': 'r215_door',
                        'x_feet': -79, 
                        'y_feet': 62, 
                        'type': 'Door'
            },
            
                # Room 217
            {
                'id': 'r217_door',
                        'x_feet': -79, 
                        'y_feet': 32, 
                        'type': 'Door'
            },
            
                # Room 221
            {
                'id': 'r221_door',
                        'x_feet': -79, 
                        'y_feet': 21, 
                        'type': 'Door'
            },
            
                # Mens restroom Room 219 
            {
                'id': 'r219_door',
                        'x_feet': -79,
                        'y_feet': 14, 
                        'type': 'Door'
            },
            
                # Room 225
            {
                'id': 'r225_door',
                        'x_feet': -60, 
                        'y_feet': 9,
                        'type': 'Door'
            },
            
                # Room 237
            {
                'id': 'r237_door',
                        'x_feet': 63.6, 
                        'y_feet': 9, 
                        'type': 'Door'
            },
            
                # Elevator 2E01
            {
                'id': 'elevator_2e01',
                        'x_feet': 77.6, 
                        'y_feet': 14.6, 
                        'type': 'Elevator'
            },
            
                # Room 241
            {
                'id': 'r241_door',
                        'x_feet': 77.6, 
                        'y_feet': 22.6, 
                        'type': 'Door'
            },
            
                # Room 241a
            {
                'id': 'r241a_door',
                        'x_feet': 77.6, 
                        'y_feet': 36.2, 
                        'type': 'Door'
            },
            
            # East of the main staircase
            
                # Room 230
            {
                'id': 'r230_door',
                        'x_feet': 18,
                        'y_feet': 0,  
                        'type': 'Door'
            },
            
                # Room 232
            {
                'id': 'r232_door',
                        'x_feet': 27,
                        'y_feet': 0,  
                        'type': 'Door'
            },
            
                # Room 234
            {
                'id': 'r234_door',
                        'x_feet': 38,
                        'y_feet': 0,  
                        'type': 'Door'
            },
            
                # Room 236
            {
                'id': 'r236_door',
                        'x_feet': 64,
                        'y_feet': 0,  
                        'type': 'Door'
            },
            
                # southeast corner of main building 
            {
                'id': 'southeast_corner',
                        'x_feet': 88, 
                        'y_feet': 0,
                        'type': 'Corner'
            },
            
                # Room 238
            {
                'id': 'r238_door',
                        'x_feet': 88,
                        'y_feet': 3, 
                        'type': 'Door'
            },
            
                # Room 240
            {
                'id': 'r240_door',
                        'x_feet': 88,
                        'y_feet': 13.8,
                        'type': 'Door'
            },
            
                # Room 240a
            {
                'id': 'r240a_door',
                        'x_feet': 88,
                        'y_feet': 20.2, 
                        'type': 'Door'
            },
            
                # Hallway MSEE crossing
            {
                'id': 'hallway_MSEEcrossing',
                        'x_feet': 88,
                        'y_feet': 25.8,
                        'type': 'Intersection'
            },
            
                # Room 242
            {
                'id': 'r242_door',
                        'x_feet': 88,
                        'y_feet': 43.4, 
                        'type': 'Door'
            },
            
                # Room 244
            {
                'id': 'r244_door',
                        'x_feet': 88,
                        'y_feet': 51.4, 
                        'type': 'Door'
            },
            
                # East staircase south corner
            {
                'id': 'staircase_east_2S02',
                        'x_feet': 88,
                        'y_feet': 59.4,
                        'type': 'Stairwell'
            },
                # Womens restroom
            {
                'id': 'r243_door',
                        'x_feet': 88,
                        'y_feet': 73, 
                        'type': 'Door'
            },
            
                # Mens restroom
            {
                'id': 'r245_door',
                        'x_feet': 88,
                        'y_feet': 83.4, 
                        'type': 'Door'
            },
            
                # Office wing
            {
                'id': 'offices_door',
                        'x_feet': 82.8,
                        'y_feet': 96.2, 
                        'type': 'Door'
            },
            
                # Inner west hallway intersections
            {
                'id': 'inner_west_hall_north', # might need change
                'x_feet': -79,
                'y_feet': 110,
                'type': 'Intersection'
            },
            {
                'id': 'inner_west_hall_south',
                'x_feet': -79,
                'y_feet': 9,
                'type': 'Intersection'
            },

                # Cross connections
            {
                'id': 'west_cross_north', # might need change
                'x_feet': -88,
                'y_feet': 110,
                'type': 'Intersection'
            },

                 # East inner area
            {
                'id': 'east_inner_south',
                'x_feet': 77.6,
                'y_feet': 9,
                'type': 'Intersection'
            },
        
            {
                'id': 'west_cross_south',  # Connects outer to inner (south)
                'x_feet': -88,
                'y_feet': 9,
                'type': 'Intersection'
            },
                # East side office wing hallway
            {
                'id': 'east_office_hall_mid',
                'x_feet': 88,
                'y_feet': 96,  # Near offices_door
                'type': 'Intersection'
            },
            
            ],
        'edges': [
            
            # ================================================================
            # MAIN HORIZONTAL HALLWAY - BOTTOM OF FLOOR (Rooms 222-236)
            # ================================================================
            
            # WEST SIDE: staircase -> west corner -> rooms -> southwest corner
            {'start': 'staircase_main_2S01', 'end': 'stair_west_corner', 'bidirectional': True},
            {'start': 'stair_west_corner', 'end': 'r226_door', 'bidirectional': True},
            {'start': 'r226_door', 'end': 'r224_door', 'bidirectional': True},
            {'start': 'r224_door', 'end': 'r222_door', 'bidirectional': True},
            {'start': 'r222_door', 'end': 'southwest_corner', 'bidirectional': True},
            
            # EAST SIDE: staircase -> east corner -> rooms -> southeast corner
            {'start': 'staircase_main_2S01', 'end': 'stair_east_corner', 'bidirectional': True},
            {'start': 'stair_east_corner', 'end': 'r230_door', 'bidirectional': True},
            {'start': 'r230_door', 'end': 'r232_door', 'bidirectional': True},
            {'start': 'r232_door', 'end': 'r234_door', 'bidirectional': True},
            {'start': 'r234_door', 'end': 'r236_door', 'bidirectional': True},
            {'start': 'r236_door', 'end': 'southeast_corner', 'bidirectional': True},
            
            
            # ================================================================
            # WEST OUTER VERTICAL HALLWAY (Rooms 220-208, along left edge)
            # ================================================================
            
            # Southwest corner -> north along outer wall
            {'start': 'southwest_corner', 'end': 'r220_door', 'bidirectional': True},
            {'start': 'r220_door', 'end': 'r218_door', 'bidirectional': True},
            {'start': 'r218_door', 'end': 'r216_door', 'bidirectional': True},
            {'start': 'r216_door', 'end': 'r214_door', 'bidirectional': True},
            {'start': 'r214_door', 'end': 'vend_south_corner', 'bidirectional': True},
            {'start': 'vend_south_corner', 'end': 'r212_door', 'bidirectional': True},
            {'start': 'r212_door', 'end': 'staircase_west_2S03', 'bidirectional': True},
            {'start': 'staircase_west_2S03', 'end': 'hallway_Bside', 'bidirectional': True},
            {'start': 'hallway_Bside', 'end': 'r208_door', 'bidirectional': True},
            {'start': 'r208_door', 'end': 'west_cross_north', 'bidirectional': True},  # To intersection
            
            
            # ================================================================
            # WEST INNER HALLWAY (Rooms 209-225, parallel to outer)
            # ================================================================
            
            # North to south along inner west hallway
            {'start': 'west_cross_north', 'end': 'inner_west_hall_north', 'bidirectional': True},
            {'start': 'inner_west_hall_north', 'end': 'r209_door', 'bidirectional': True},
            {'start': 'r209_door', 'end': 'r211_door', 'bidirectional': True},
            {'start': 'r211_door', 'end': 'r215_door', 'bidirectional': True},
            {'start': 'r215_door', 'end': 'r217_door', 'bidirectional': True},
            {'start': 'r217_door', 'end': 'r221_door', 'bidirectional': True},
            {'start': 'r221_door', 'end': 'r219_door', 'bidirectional': True},  # Men's restroom
            {'start': 'r219_door', 'end': 'inner_west_hall_south', 'bidirectional': True},
            {'start': 'inner_west_hall_south', 'end': 'r225_door', 'bidirectional': True},
            {'start': 'r225_door', 'end': 'r237_door', 'bidirectional': True},
            
            
            # Connection from inner hallway back to main hallway area
            {'start': 'inner_west_hall_south', 'end': 'west_cross_south', 'bidirectional': True},
            {'start': 'west_cross_south', 'end': 'southwest_corner', 'bidirectional': True},
    

            # ================================================================
            # EAST OUTER VERTICAL HALLWAY (Rooms 238-245, along right edge)
            # ================================================================
            
            # Southeast corner -> north along outer wall
            {'start': 'southeast_corner', 'end': 'r238_door', 'bidirectional': True},
            {'start': 'r238_door', 'end': 'r240_door', 'bidirectional': True},
            {'start': 'r240_door', 'end': 'r240a_door', 'bidirectional': True},
            {'start': 'r240a_door', 'end': 'hallway_MSEEcrossing', 'bidirectional': True},
            {'start': 'hallway_MSEEcrossing', 'end': 'r242_door', 'bidirectional': True},
            {'start': 'r242_door', 'end': 'r244_door', 'bidirectional': True},
            {'start': 'r244_door', 'end': 'staircase_east_2S02', 'bidirectional': True},
            {'start': 'staircase_east_2S02', 'end': 'r243_door', 'bidirectional': True},  # Women's restroom
            {'start': 'r243_door', 'end': 'r245_door', 'bidirectional': True},  # Men's restroom
            {'start': 'r245_door', 'end': 'east_office_hall_mid', 'bidirectional': True},
            {'start': 'east_office_hall_mid', 'end': 'offices_door', 'bidirectional': True},
            
            # ================================================================
            # EAST INNER AREA (Rooms 237, 240A, 241, 241A, 249, etc.)
            # ================================================================
            
            # Connect rooms in east inner section
            {'start': 'r237_door', 'end': 'east_inner_south', 'bidirectional': True},
            {'start': 'east_inner_south', 'end': 'r241_door', 'bidirectional': True},
            {'start': 'r241_door', 'end': 'r241a_door', 'bidirectional': True},
            
                    ],
        
        'landmarks': [
            {
                'name': 'Room 226',
                'x_feet': -28,
                'y_feet': -5,  # 5 feet south into the room (rooms are on south side of hallway)
                'nearest_node': 'r226_door',
                'bearing': 'South'
            },
            {
                'name': 'Room 224',
                'x_feet': -54,
                'y_feet': -5,
                'nearest_node': 'r224_door',
                'bearing': 'South'
            },
            {
                'name': 'Room 222',
                'x_feet': -82,
                'y_feet': -5,
                'nearest_node': 'r222_door',
                'bearing': 'South'
            },
            
            # ================================================================
            # WEST OUTER VERTICAL HALLWAY (220-208)
            # ================================================================
            
            {
                'name': 'Room 220',
                'x_feet': -93,  # 5 feet west into the room
                'y_feet': 4,
                'nearest_node': 'r220_door',
                'bearing': 'West'
            },
            {
                'name': 'Room 218',
                'x_feet': -93,
                'y_feet': 14,
                'nearest_node': 'r218_door',
                'bearing': 'West'
            },
            {
                'name': 'Room 216',
                'x_feet': -93,
                'y_feet': 42,
                'nearest_node': 'r216_door',
                'bearing': 'West'
            },
            {
                'name': 'Room 214',
                'x_feet': -93,
                'y_feet': 45,
                'nearest_node': 'r214_door',
                'bearing': 'West'
            },
            {
                'name': 'Room 212',
                'x_feet': -93,
                'y_feet': 56,
                'nearest_node': 'r212_door',
                'bearing': 'West'
            },
            {
                'name': 'Room 208',
                'x_feet': -93,
                'y_feet': 96,
                'nearest_node': 'r208_door',
                'bearing': 'West'
            },
            {
                'name': 'Room 206',
                'x_feet': -93,  # Update when you have real coordinates
                'y_feet': 56,   # Update when you have real coordinates
                'nearest_node': 'r206_door',
                'bearing': 'West'
            },
            {
                'name': 'Room 207',
                'x_feet': -93,  # Update when you have real coordinates
                'y_feet': 56,   # Update when you have real coordinates
                'nearest_node': 'r207_door',
                'bearing': 'West'
            },
            
            # ================================================================
            # WEST INNER HALLWAY (209-225)
            # ================================================================
            
            {
                'name': 'Room 209',
                'x_feet': -74,  # 5 feet east into the room
                'y_feet': 106,
                'nearest_node': 'r209_door',
                'bearing': 'East'
            },
            {
                'name': 'Room 211',
                'x_feet': -74,
                'y_feet': 71,
                'nearest_node': 'r211_door',
                'bearing': 'East'
            },
            {
                'name': 'Room 215',
                'x_feet': -74,
                'y_feet': 62,
                'nearest_node': 'r215_door',
                'bearing': 'East'
            },
            {
                'name': 'Room 217',
                'x_feet': -74,
                'y_feet': 32,
                'nearest_node': 'r217_door',
                'bearing': 'East'
            },
            {
                'name': 'Room 221',
                'x_feet': -74,
                'y_feet': 21,
                'nearest_node': 'r221_door',
                'bearing': 'East'
            },
            {
                'name': "Men's Restroom 219",  # West side men's restroom
                'x_feet': -74,
                'y_feet': 14,
                'nearest_node': 'r219_door',
                'bearing': 'East'
            },
            {
                'name': 'Room 225',
                'x_feet': -55,  # 5 feet east
                'y_feet': 9,
                'nearest_node': 'r225_door',
                'bearing': 'East'
            },
            
            # ================================================================
            # EAST SIDE ROOMS (Bottom horizontal hallway: 230-236)
            # ================================================================
            
            {
                'name': 'Room 230',
                'x_feet': 18,
                'y_feet': -5,  # 5 feet south into the room
                'nearest_node': 'r230_door',
                'bearing': 'South'
            },
            {
                'name': 'Room 232',
                'x_feet': 27,
                'y_feet': -5,
                'nearest_node': 'r232_door',
                'bearing': 'South'
            },
            {
                'name': 'Room 234',
                'x_feet': 38,
                'y_feet': -5,
                'nearest_node': 'r234_door',
                'bearing': 'South'
            },
            {
                'name': 'Room 236',
                'x_feet': 64,
                'y_feet': -5,
                'nearest_node': 'r236_door',
                'bearing': 'South'
            },
            
            # ================================================================
            # EAST OUTER VERTICAL HALLWAY (238-245)
            # ================================================================
            
            {
                'name': 'Room 238',
                'x_feet': 93,  # 5 feet east into the room
                'y_feet': 3,
                'nearest_node': 'r238_door',
                'bearing': 'East'
            },
            {
                'name': 'Room 240',
                'x_feet': 93,
                'y_feet': 13.8,
                'nearest_node': 'r240_door',
                'bearing': 'East'
            },
            {
                'name': 'Room 240A',
                'x_feet': 93,
                'y_feet': 20.2,
                'nearest_node': 'r240a_door',
                'bearing': 'East'
            },
            {
                'name': 'Room 242',
                'x_feet': 93,
                'y_feet': 43.4,
                'nearest_node': 'r242_door',
                'bearing': 'East'
            },
            {
                'name': 'Room 244',
                'x_feet': 93,
                'y_feet': 51.4,
                'nearest_node': 'r244_door',
                'bearing': 'East'
            },
            {
                'name': "Women's Restroom 243",  # East side women's restroom
                'x_feet': 93,
                'y_feet': 73,
                'nearest_node': 'r243_door',
                'bearing': 'East'
            },
            {
                'name': "Men's Restroom 245",  # East side men's restroom
                'x_feet': 93,
                'y_feet': 83.4,
                'nearest_node': 'r245_door',
                'bearing': 'East'
            },
            
            # ================================================================
            # EAST INNER AREA (237, 241, 241A)
            # ================================================================
            
            {
                'name': 'Room 237',
                'x_feet': 68.6,  # 5 feet east into the room
                'y_feet': 9,
                'nearest_node': 'r237_door',
                'bearing': 'East'
            },
            {
                    'name': 'Elevator 2E01',  
                    'x_feet': 77.6,
                    'y_feet': 14.6,
                    'nearest_node': 'elevator_2e01',
                    'bearing': 'North'
                },
            {
                'name': 'Room 241',
                'x_feet': 82.6,  # 5 feet east
                'y_feet': 22.6,
                'nearest_node': 'r241_door',
                'bearing': 'East'
            },
            {
                'name': 'Room 241A',
                'x_feet': 82.6,
                'y_feet': 36.2,
                'nearest_node': 'r241a_door',
                'bearing': 'East'
            },
            
            # ================================================================
            # SPECIAL LOCATIONS (Staircases, Offices, Vending)
            # ================================================================
            
            {
                'name': 'Main Staircase',  # Main central staircase (2S01)
                'x_feet': 0,
                'y_feet': 0,
                'nearest_node': 'staircase_main_2S01',
                'bearing': 'North'  # Arbitrary, staircase is the node itself
            },
            {
                'name': 'West Staircase',  # West staircase (2S03)
                'x_feet': -88,
                'y_feet': 66,
                'nearest_node': 'staircase_west_2S03',
                'bearing': 'North'
            },
            {
                'name': 'East Staircase',  # East staircase (2S02)
                'x_feet': 88,
                'y_feet': 59.4,
                'nearest_node': 'staircase_east_2S02',
                'bearing': 'North'
            },
            {
                'name': 'Office Wing',  # General office area
                'x_feet': 78,  # 5 feet west into the wing
                'y_feet': 96.2,
                'nearest_node': 'offices_door',
                'bearing': 'West'
            },
            {
                'name': 'Vending Machines',  # Vending machine area
                'x_feet': -88,
                'y_feet': 56,
                'nearest_node': 'vend_south_corner',
                'bearing': 'West'  # Or whichever direction they're located
            },
            
            # ================================================================
            # OPTIONAL: Searchable Hallway Names
            # ================================================================
            # These are optional - only add if you want users to search for hallways
            
            {
                'name': 'Main Hallway',  # The main bottom hallway
                'x_feet': 0,
                'y_feet': 0,
                'nearest_node': 'staircase_main_2S01',
                'bearing': 'South'
            },
            {
                'name': 'Building B Connection',  # Hallway to Building B
                'x_feet': -88,
                'y_feet': 72,
                'nearest_node': 'hallway_Bside',
                'bearing': 'North'
            },
            {
                'name': 'MSEE Connection',  # Hallway to MSEE building
                'x_feet': 88,
                'y_feet': 25.8,
                'nearest_node': 'hallway_MSEEcrossing',
                'bearing': 'East'
                },
            ]
        }
    ]
}






