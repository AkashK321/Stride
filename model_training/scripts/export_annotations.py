"""
Export completed annotations from Label Studio.

Connects to a running Label Studio instance, pulls all completed annotations
for a project, and saves them as JSON for downstream conversion to YOLO format.

Usage:
    python scripts/export_annotations.py --api-key YOUR_KEY --project-id 1
"""

import argparse
import json
import sys
from pathlib import Path

import requests

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_DIR = SCRIPT_DIR.parent

LABEL_STUDIO_URL = "http://localhost:8080"


def export_annotations(api_key, project_id, output_dir):
    """
    Export all annotations from a Label Studio project.

    Returns the path to the saved JSON file.
    """
    headers = {"Authorization": f"Token {api_key}"}
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    print(f"Exporting annotations from project {project_id}...")
    resp = requests.get(
        f"{LABEL_STUDIO_URL}/api/projects/{project_id}/export?exportType=JSON",
        headers=headers,
    )

    if resp.status_code != 200:
        print(f"Export failed: {resp.status_code} — {resp.text}")
        sys.exit(1)

    tasks = resp.json()

    output_path = output_dir / "label_studio_export.json"
    with open(output_path, "w") as f:
        json.dump(tasks, f, indent=2)

    total_annotations = 0
    total_boxes = 0
    for task in tasks:
        for annotation in task.get("annotations", []):
            total_annotations += 1
            total_boxes += sum(
                1 for r in annotation.get("result", []) if r.get("type") == "rectanglelabels"
            )

    print(f"Exported {len(tasks)} tasks:")
    print(f"  Annotations: {total_annotations}")
    print(f"  Bounding boxes: {total_boxes}")
    print(f"  Saved to: {output_path}")

    return output_path


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Export annotations from Label Studio")
    parser.add_argument("--api-key", type=str, required=True, help="Label Studio API key")
    parser.add_argument("--project-id", type=int, required=True, help="Label Studio project ID")
    parser.add_argument(
        "--output",
        type=str,
        default=str(PROJECT_DIR / "annotations" / "raw"),
        help="Output directory",
    )

    args = parser.parse_args()
    export_annotations(args.api_key, args.project_id, args.output)
