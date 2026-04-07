import boto3
import os
import logging

logger = logging.getLogger()
logger.setLevel(logging.INFO)

# COCO DATASET (80 Classes) - Estimated Real World Heights (Meters)
# -1.0 means "Variable/Unknown" (Use Ground Plane Algorithm)
COCO_DATA = [
    # --- PERSON ---
    {"id": 0, "name": "person", "h": 1.70},

    # --- VEHICLES ---
    {"id": 1, "name": "bicycle", "h": 1.00},
    {"id": 2, "name": "car", "h": 1.50},
    {"id": 3, "name": "motorcycle", "h": 1.00},
    {"id": 4, "name": "airplane", "h": 4.00},
    {"id": 5, "name": "bus", "h": 3.20},
    {"id": 6, "name": "train", "h": 4.00},
    {"id": 7, "name": "truck", "h": 3.00},
    {"id": 8, "name": "boat", "h": 1.50},

    # --- TRAFFIC / OUTDOOR ---
    {"id": 9, "name": "traffic light", "h": 0.75}, # Box height itself
    {"id": 10, "name": "fire hydrant", "h": 0.60},
    {"id": 11, "name": "stop sign", "h": 0.75},
    {"id": 12, "name": "parking meter", "h": 1.20},
    {"id": 13, "name": "bench", "h": 0.90},

    # --- ANIMALS ---
    {"id": 14, "name": "bird", "h": 0.20},
    {"id": 15, "name": "cat", "h": 0.25},
    {"id": 16, "name": "dog", "h": 0.50},
    {"id": 17, "name": "horse", "h": 1.60},
    {"id": 18, "name": "sheep", "h": 0.80},
    {"id": 19, "name": "cow", "h": 1.40},
    {"id": 20, "name": "elephant", "h": 3.00},
    {"id": 21, "name": "bear", "h": 1.20}, # Standing on all fours
    {"id": 22, "name": "zebra", "h": 1.30},
    {"id": 23, "name": "giraffe", "h": 5.00},

    # --- ACCESSORIES ---
    {"id": 24, "name": "backpack", "h": 0.50},
    {"id": 25, "name": "umbrella", "h": 0.90}, # Open
    {"id": 26, "name": "handbag", "h": 0.30},
    {"id": 27, "name": "tie", "h": 0.40},
    {"id": 28, "name": "suitcase", "h": 0.70},
    {"id": 29, "name": "frisbee", "h": 0.05},
    {"id": 30, "name": "skis", "h": 1.60},
    {"id": 31, "name": "snowboard", "h": 1.50},
    {"id": 32, "name": "sports ball", "h": 0.22},
    {"id": 33, "name": "kite", "h": 0.80},
    {"id": 34, "name": "baseball bat", "h": 0.90},
    {"id": 35, "name": "baseball glove", "h": 0.25},
    {"id": 36, "name": "skateboard", "h": 0.20},
    {"id": 37, "name": "surfboard", "h": 2.00},
    {"id": 38, "name": "tennis racket", "h": 0.70},

    # --- INDOOR / KITCHEN ---
    {"id": 39, "name": "bottle", "h": 0.25},
    {"id": 40, "name": "wine glass", "h": 0.15},
    {"id": 41, "name": "cup", "h": 0.10},
    {"id": 42, "name": "fork", "h": 0.15},
    {"id": 43, "name": "knife", "h": 0.20},
    {"id": 44, "name": "spoon", "h": 0.15},
    {"id": 45, "name": "bowl", "h": 0.10},
    {"id": 46, "name": "banana", "h": 0.15},
    {"id": 47, "name": "apple", "h": 0.08},
    {"id": 48, "name": "sandwich", "h": 0.08},
    {"id": 49, "name": "orange", "h": 0.08},
    {"id": 50, "name": "broccoli", "h": 0.15},
    {"id": 51, "name": "carrot", "h": 0.20},
    {"id": 52, "name": "hot dog", "h": 0.15},
    {"id": 53, "name": "pizza", "h": 0.05},
    {"id": 54, "name": "donut", "h": 0.05},
    {"id": 55, "name": "cake", "h": 0.15},

    # --- FURNITURE ---
    {"id": 56, "name": "chair", "h": 0.90},
    {"id": 57, "name": "couch", "h": 0.80},
    {"id": 58, "name": "potted plant", "h": 0.50},
    {"id": 59, "name": "bed", "h": 0.60},
    {"id": 60, "name": "dining table", "h": 0.75},
    {"id": 61, "name": "toilet", "h": 0.45},

    # --- ELECTRONICS ---
    {"id": 62, "name": "tv", "h": 0.60},
    {"id": 63, "name": "laptop", "h": 0.25}, # Open
    {"id": 64, "name": "mouse", "h": 0.04},
    {"id": 65, "name": "remote", "h": 0.15},
    {"id": 66, "name": "keyboard", "h": 0.05},
    {"id": 67, "name": "cell phone", "h": 0.15},
    {"id": 68, "name": "microwave", "h": 0.35},
    {"id": 69, "name": "oven", "h": 0.80},
    {"id": 70, "name": "toaster", "h": 0.20},
    {"id": 71, "name": "sink", "h": 0.85},
    {"id": 72, "name": "refrigerator", "h": 1.75},

    # --- MISC ---
    {"id": 73, "name": "book", "h": 0.25},
    {"id": 74, "name": "clock", "h": 0.30},
    {"id": 75, "name": "vase", "h": 0.40},
    {"id": 76, "name": "scissors", "h": 0.15},
    {"id": 77, "name": "teddy bear", "h": 0.40},
    {"id": 78, "name": "hair drier", "h": 0.20},
    {"id": 79, "name": "toothbrush", "h": 0.15},
]

dynamodb = boto3.resource("dynamodb")

def main():
    table_name = os.environ.get("TABLE_NAME")
    if not table_name:
        print("❌ Error: TABLE_NAME environment variable is required.")
        exit(1)

    print(f"Populating table {table_name}...")
    dynamodb = boto3.resource("dynamodb", region_name="us-east-1")
    table = dynamodb.Table(table_name)
    
    try:
        with table.batch_writer() as batch:
            for item in COCO_DATA:
                batch.put_item(Item={
                    "class_id": item["id"],
                    "class_name": item["name"],
                    "avg_height_meters": str(item["h"])
                })
        print("✅ Data population complete!")

    except Exception as e:
        print(f"❌ Error: {e}")
        exit(1)

if __name__ == "__main__":
    main()