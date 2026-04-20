import sys
from pathlib import Path
import runpy


def main():
    """Compatibility wrapper. Canonical script moved to map_population/populate_rds.py."""
    target = Path(__file__).resolve().parents[1] / "map_population" / "populate_rds.py"
    runpy.run_path(str(target), run_name="__main__")

if __name__ == "__main__":
    main()