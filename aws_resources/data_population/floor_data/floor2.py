'''

'''

FLOOR2_DATA = {
    'building_id': B01,
    'building_name': BHEE,
    # 'gps_lat":
    # 'gps_long':
    'floor_number': 2, 
    'map_image_url': None,
    # 'map_scale_ratio': 0.03048, 
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
                    'type': 'Corner'
        },
        
            # east corner of the staircase
        {
            'id': 'stair_east_corner',
                    'x_feet': 13, 
                    'y_feet': 0,
                    'type': 'Corner'
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
            'id': 'vend__south corner',
                    'x_feet': -88, 
                    'y_feet': 56,
                    'type': 'Corner'
        },
        
            # Room 212 TO DO
        {
            'id': 'r212_door',
                    'x_feet': -88, # TO DO
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
                    'type': 'Stairwell'
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
                    'x_feet': -79, # TO DO
                    'y_feet': 62, # TO DO
                    'type': 'Door'
        },
        
            # Room 211
        {
            'id': 'r211_door',
                    'x_feet': -79, # TO DO
                    'y_feet': 71, # TO DO
                    'type': 'Door'
        },
        
            # Room 215
        {
            'id': 'r215_door',
                    'x_feet': -79, # TO DO
                    'y_feet': 62, # TO DO
                    'type': 'Door'
        },
        
            # Room 217
        {
            'id': 'r217_door',
                    'x_feet': -79, # TO DO
                    'y_feet': 32, # TO DO
                    'type': 'Door'
        },
        
            # Room 221
        {
            'id': 'r221_door',
                    'x_feet': -79, # TO DO
                    'y_feet': 21, # TO DO
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
                    'x_feet': -79, # TO DO
                    'y_feet': 56, # TO DO
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
            'id': 'southwest_corner',
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
            'id': 'r240a_door',
                    'x_feet': 88,
                    'y_feet': 13.8,
                    'type': 'Door'
        },
        
            # Room 240
        {
            'id': 'r240b_door',
                    'x_feet': 88,
                    'y_feet': 20.2, 
                    'type': 'Door'
        },
        
            # Hallway MSEE crossing
        {
            'id': 'hallway_MSEEcrossing',
                    'x_feet': 88,
                    'y_feet': 25.8,
                    'type': 'Stairwell'
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
            'id': 'staircase_west_2S02',
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
        
        ],
    'edges': [...],
    'landmarks': [
        {
            'name': 'Room 101',
                    'x_feet': 20,   # Slightly inside the room
                    'y_feet': -20,  # 5 feet further south than the door
                    'nearest_node': 'room_101_door',  # Which node is closest
                    'bearing': 'South'  # Direction from node to landmark
        }
    ]
    
    
}