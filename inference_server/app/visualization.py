"""Draw detection boxes on a PIL image for the dev dashboard."""

from __future__ import annotations

import io
from typing import Any

from PIL import Image, ImageDraw, ImageFont


def render_overlay_rgb(image: Image.Image, predictions: list[dict[str, Any]]) -> bytes:
    """Return PNG bytes with boxes drawn (for dashboard preview)."""
    img = image.copy()
    draw = ImageDraw.Draw(img)
    try:
        font = ImageFont.load_default()
    except Exception:
        font = None

    for i, pred in enumerate(predictions):
        box = pred.get("box") or {}
        x1 = int(box.get("x1", 0))
        y1 = int(box.get("y1", 0))
        x2 = int(box.get("x2", 0))
        y2 = int(box.get("y2", 0))
        label = f"{pred.get('class', '?')} {float(pred.get('confidence', 0)):.2f}"
        color = _color(i)
        draw.rectangle([x1, y1, x2, y2], outline=color, width=2)
        if font:
            draw.text((x1, max(0, y1 - 12)), label, fill=color, font=font)
        else:
            draw.text((x1, max(0, y1 - 12)), label, fill=color)

    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def _color(index: int) -> tuple[int, int, int]:
    palette = [
        (255, 64, 64),
        (64, 200, 64),
        (64, 128, 255),
        (255, 180, 64),
        (200, 64, 200),
        (64, 200, 200),
    ]
    return palette[index % len(palette)]
