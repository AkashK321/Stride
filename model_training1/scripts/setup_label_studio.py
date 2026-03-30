"""
Label Studio setup and configuration for BHEE door sign annotation.

Launches Label Studio locally, creates a project with the correct labeling
interface (bounding box with door_sign class), and optionally imports
auto-generated pre-annotations for faster human review.

Usage:
    # First launch — starts Label Studio and prints setup instructions
    python scripts/setup_label_studio.py

    # After getting your API key from the Label Studio UI
    python scripts/setup_label_studio.py --api-key YOUR_KEY --no-launch

    # Import pre-annotations from auto_prelabel.py
    python scripts/setup_label_studio.py --api-key YOUR_KEY --no-launch --import-predictions
"""

import argparse
import json
import os
import subprocess
import sys
import time
from pathlib import Path

import requests

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_DIR = SCRIPT_DIR.parent

LABEL_STUDIO_URL = "http://localhost:8080"

# Label Studio XML config for bounding-box annotation with our class
LABELING_CONFIG = """
<View>
  <Header value="Draw a tight bounding box around each door sign.
                  Include the entire sign (shape + context), not just the text." />
  <Image name="image" value="$image" zoom="true" zoomControl="true"
         rotateControl="false" brightnessControl="true" contrastControl="true" />
  <RectangleLabels name="label" toName="image" strokeWidth="3" opacity="0.25">
    <Label value="door_sign" background="#FF0000" />
  </RectangleLabels>
</View>
""".strip()


def check_label_studio_installed():
    try:
        import label_studio  # noqa: F401

        return True
    except ImportError:
        return False


def wait_for_label_studio(url, timeout=90):
    """Poll until Label Studio responds or timeout is reached."""
    print("Waiting for Label Studio to become available...")
    start = time.time()
    while time.time() - start < timeout:
        try:
            resp = requests.get(f"{url}/api/version", timeout=5)
            if resp.status_code == 200:
                return True
        except requests.ConnectionError:
            pass
        time.sleep(3)
    return False


def create_project(api_key, project_name="BHEE Door Sign Detection"):
    """Create a Label Studio project configured for door sign annotation."""
    headers = {"Authorization": f"Token {api_key}", "Content-Type": "application/json"}

    # Check if project already exists
    resp = requests.get(f"{LABEL_STUDIO_URL}/api/projects", headers=headers)
    if resp.status_code == 200:
        for project in resp.json().get("results", []):
            if project["title"] == project_name:
                print(f"Project already exists: '{project_name}' (ID: {project['id']})")
                return project["id"]

    data = {
        "title": project_name,
        "description": (
            "BHEE building door sign annotation for YOLOv11 training. "
            "Draw tight bounding boxes around the ENTIRE door sign — "
            "include shape and mounting context, not just the text."
        ),
        "label_config": LABELING_CONFIG,
        "is_published": True,
    }

    resp = requests.post(f"{LABEL_STUDIO_URL}/api/projects", headers=headers, json=data)

    if resp.status_code == 201:
        project_id = resp.json()["id"]
        print(f"Created project: '{project_name}' (ID: {project_id})")
        return project_id

    print(f"Failed to create project: {resp.status_code} — {resp.text}")
    sys.exit(1)


def import_tasks_from_images(api_key, project_id, image_dir):
    """Import image tasks into the Label Studio project."""
    headers = {"Authorization": f"Token {api_key}", "Content-Type": "application/json"}

    image_dir = Path(image_dir)
    extensions = {".jpg", ".jpeg", ".png", ".bmp", ".tiff", ".webp"}
    image_files = sorted(f for f in image_dir.iterdir() if f.suffix.lower() in extensions)

    if not image_files:
        print(f"No images found in {image_dir}")
        return

    tasks = [{"data": {"image": f"/data/local-files/?d={f.name}"}} for f in image_files]

    resp = requests.post(
        f"{LABEL_STUDIO_URL}/api/projects/{project_id}/import",
        headers=headers,
        json=tasks,
    )

    if resp.status_code in (200, 201):
        print(f"Imported {len(tasks)} image tasks into project {project_id}")
    else:
        print(f"Failed to import tasks: {resp.status_code} — {resp.text}")


def import_predictions(api_key, project_id, predictions_path):
    """Import auto-generated pre-annotations into Label Studio."""
    headers = {"Authorization": f"Token {api_key}", "Content-Type": "application/json"}

    predictions_path = Path(predictions_path)
    if not predictions_path.exists():
        print(f"No predictions file found at {predictions_path}")
        print("Run auto_prelabel.py first to generate pre-annotations.")
        return

    with open(predictions_path) as f:
        predictions = json.load(f)

    if not predictions:
        print("Predictions file is empty — nothing to import.")
        return

    resp = requests.post(
        f"{LABEL_STUDIO_URL}/api/projects/{project_id}/import",
        headers=headers,
        json=predictions,
    )

    if resp.status_code in (200, 201):
        print(f"Imported {len(predictions)} pre-annotated tasks")
    else:
        print(f"Failed to import predictions: {resp.status_code} — {resp.text}")


def launch_label_studio():
    """Start Label Studio as a subprocess with local file serving enabled."""
    env = {
        **os.environ,
        "LABEL_STUDIO_LOCAL_FILES_SERVING_ENABLED": "true",
        "LABEL_STUDIO_LOCAL_FILES_DOCUMENT_ROOT": str(PROJECT_DIR),
    }

    print(f"Starting Label Studio on {LABEL_STUDIO_URL} ...")
    process = subprocess.Popen(
        ["label-studio", "start", "--port", "8080"],
        env=env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )

    if not wait_for_label_studio(LABEL_STUDIO_URL):
        print("Label Studio did not start within the timeout.")
        print("Try running manually: label-studio start --port 8080")
        sys.exit(1)

    print("Label Studio is running!\n")
    return process


def setup(api_key=None, launch=True, import_preds=False):
    if not check_label_studio_installed():
        print("Label Studio is not installed. Run:")
        print("  pip install -r requirements.txt")
        sys.exit(1)

    image_dir = PROJECT_DIR / "bhee_clean_dataset"
    if not image_dir.exists():
        print(f"Warning: {image_dir} does not exist yet.")
        print("Add your cleaned BHEE images there before importing.\n")

    if launch:
        launch_label_studio()

    if api_key:
        project_id = create_project(api_key)

        if import_preds:
            # Single import: every image + optional pre-labels (avoids duplicate tasks)
            import_path = PROJECT_DIR / "annotations" / "label_studio_import.json"
            import_predictions(api_key, project_id, import_path)
        elif image_dir.exists() and any(image_dir.iterdir()):
            import_tasks_from_images(api_key, project_id, image_dir)

        print(f"\nOpen {LABEL_STUDIO_URL}/projects/{project_id} to start annotating.\n")
        print("Annotation guidelines:")
        print("  1. Draw bounding boxes around the ENTIRE door sign")
        print("  2. Include the sign's shape and wall context, not just text")
        print("  3. Keep boxes tight but fully encompassing")
        print("  4. Label every visible door sign in each image")
    else:
        print(f"Label Studio is running at {LABEL_STUDIO_URL}")
        print()
        print("Next steps:")
        print("  1. Open the URL above and create an account")
        print("  2. Go to Account & Settings -> copy your API key")
        print("  3. Re-run this script with your key:")
        print(f"     python {Path(__file__).name} --api-key YOUR_KEY --no-launch")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Set up Label Studio for BHEE annotation")
    parser.add_argument("--api-key", type=str, help="Label Studio API key")
    parser.add_argument(
        "--no-launch", action="store_true", help="Skip launching (Label Studio already running)"
    )
    parser.add_argument(
        "--import-predictions",
        action="store_true",
        help="Import auto-generated pre-annotations from auto_prelabel.py",
    )

    args = parser.parse_args()
    setup(api_key=args.api_key, launch=not args.no_launch, import_preds=args.import_predictions)
