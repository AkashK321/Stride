import math
import matplotlib.pyplot as plt

# Import the data from your attached file
# Ensure your file is named floor2.py
from floor2 import FLOOR2_DATA

def get_heading(x1, y1, x2, y2):
    """Calculates the heading from (x1, y1) to (x2, y2)."""
    dx = x2 - x1
    dy = y2 - y1
    
    if dx == 0 and dy > 0: return "N"
    if dx == 0 and dy < 0: return "S"
    if dy == 0 and dx > 0: return "E"
    if dy == 0 and dx < 0: return "W"
    
    # If diagonal, return the angle in degrees
    angle = math.degrees(math.atan2(dy, dx))
    # Normalize to 0-360
    angle = (angle + 360) % 360
    return f"{angle:.0f}°"

def plot_floor_map():
    # Extract the floor data
    floor_data = FLOOR2_DATA['floors'][0]
    nodes = floor_data['nodes']
    edges = floor_data['edges']
    landmarks = floor_data['landmarks']

    # Create a dictionary to easily look up node coordinates by their ID
    node_coords = {node['id']: (node['x_feet'], node['y_feet']) for node in nodes}

    # Initialize the plot
    fig, ax = plt.subplots(figsize=(14, 10))
    
    # 1. Plot the Edges (Hallways) and their Headings
    for edge in edges:
        start_id = edge['start']
        end_id = edge['end']
        
        if start_id in node_coords and end_id in node_coords:
            x1, y1 = node_coords[start_id]
            x2, y2 = node_coords[end_id]
            
            # Draw the line
            ax.plot([x1, x2], [y1, y2], color='gray', linewidth=4, zorder=1, label='Hallways' if edge == edges[0] else "")
            
            # Calculate midpoint for the label
            mid_x = (x1 + x2) / 2
            mid_y = (y1 + y2) / 2
            
            # Get the heading string
            heading = get_heading(x1, y1, x2, y2)
            
            # Add the heading label to the plot
            ax.text(mid_x, mid_y, heading, color='darkgreen', fontsize=8, fontweight='bold',
                    ha='center', va='center', zorder=4,
                    bbox=dict(facecolor='white', edgecolor='none', alpha=0.7, pad=1))

    # 2. Plot the Nodes (Doors, Intersections, Stairwells)
    node_x = [node['x_feet'] for node in nodes]
    node_y = [node['y_feet'] for node in nodes]
    
    for node in nodes:
        color = 'blue'
        marker = 'o'
        size = 30
        
        if node['type'] == 'Stairwell':
            color = 'orange'
            marker = 's'
            size = 60
        elif node['type'] == 'Elevator':
            color = 'purple'
            marker = '^'
            size = 60
        elif node['type'] == 'Intersection' or node['type'] == 'Corner':
            color = 'black'
            size = 20
            
        ax.scatter(node['x_feet'], node['y_feet'], color=color, marker=marker, s=size, zorder=2)

    # 3. Plot the Landmarks (Rooms and specialized areas)
    lm_x = [lm['x_feet'] for lm in landmarks]
    lm_y = [lm['y_feet'] for lm in landmarks]
    ax.scatter(lm_x, lm_y, color='red', marker='*', s=100, zorder=3, label='Landmarks')

    for lm in landmarks:
        ax.annotate(lm['name'], (lm['x_feet'], lm['y_feet']), 
                    textcoords="offset points", xytext=(0, 5), ha='center', fontsize=8)

    # 4. Add Directional Labels (North, South, East, West)
    min_x, max_x = min(node_x), max(node_x)
    min_y, max_y = min(node_y), max(node_y)
    mid_x_bounds = (min_x + max_x) / 2
    mid_y_bounds = (min_y + max_y) / 2

    bbox_props = dict(boxstyle="round,pad=0.3", fc="lightgray", ec="black", alpha=0.8)
    
    ax.text(mid_x_bounds, max_y + 10, 'NORTH', ha='center', va='bottom', fontsize=14, fontweight='bold', bbox=bbox_props)
    ax.text(mid_x_bounds, min_y - 15, 'SOUTH', ha='center', va='top', fontsize=14, fontweight='bold', bbox=bbox_props)
    ax.text(max_x + 10, mid_y_bounds, 'EAST', ha='left', va='center', fontsize=14, fontweight='bold', rotation=-90, bbox=bbox_props)
    ax.text(min_x - 10, mid_y_bounds, 'WEST', ha='right', va='center', fontsize=14, fontweight='bold', rotation=90, bbox=bbox_props)

    # 5. Formatting the Graph
    ax.set_title(f"Floor Plan Graph: {FLOOR2_DATA['building_name']} - Floor {floor_data['floor_number']}", fontsize=16, pad=20)
    ax.set_xlabel("X (Feet)")
    ax.set_ylabel("Y (Feet)")
    
    ax.set_aspect('equal', adjustable='box')
    ax.set_xlim(min_x - 20, max_x + 20)
    ax.set_ylim(min_y - 25, max_y + 20)
    ax.grid(True, linestyle='--', alpha=0.6)
    
    from matplotlib.lines import Line2D
    legend_elements = [
        Line2D([0], [0], color='gray', lw=4, label='Pathways/Edges'),
        Line2D([0], [0], marker='o', color='w', markerfacecolor='blue', markersize=8, label='Doors'),
        Line2D([0], [0], marker='s', color='w', markerfacecolor='orange', markersize=8, label='Stairwells'),
        Line2D([0], [0], marker='*', color='w', markerfacecolor='red', markersize=12, label='Landmarks')
    ]
    ax.legend(handles=legend_elements, loc='upper left')

    plt.tight_layout()
    plt.show()

if __name__ == "__main__":
    plot_floor_map()