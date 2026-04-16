# OCR findings (sign crops, Roboflow dataset)

This document summarizes experiments on the Stride door-sign dataset at `roboflow_dataset/Stride.yolov11/train/` (135 images, polygon labels for class `sign`, 214 sign crops total). The test script crops each annotated region, preprocesses it, runs OCR, and optionally saves debug images to `ocr_test_results/`.

## OCR engine comparison

| Metric | Tesseract (PSM 7 + fallback, Otsu + upscale) | EasyOCR (CPU, English) |
|--------|-----------------------------------------------|-------------------------|
| Signs with any raw OCR output | 170 (79%) | 132 (62%) |
| Signs with extracted digits (sanitized) | 36 (**16.8%**) | 112 (**52.3%**) |

**Recommendation:** Use a scene-text model such as **EasyOCR** (or PaddleOCR / on-device ML Kit / Apple Vision) for prototyping and evaluation. Tesseract is tuned for scanned documents; these crops are natural-scene text at varying scale and contrast.

**Sanitization:** Digits (and optional trailing letter) were extracted with regex from the raw string for the “extracted digits” metric.

## Accuracy notes

- Source images are high resolution (e.g. 4284×5712). Sign regions are often **small in the frame** (many crops ~40–170 px wide). OCR quality drops sharply when the sign occupies few pixels.
- Failures cluster on **very small crops** (often &lt; ~80 px wide). Crops with more pixels tend to read reliably (room numbers such as 236, 238, 240, 242, 225, etc.).
- One outlier crop (`IMG_3884` … `sign1`) is **extremely large** (~2119×2837 px) due to annotation geometry; it dominates worst-case latency and is not representative of typical door-sign crops.

## Latency (EasyOCR, CPU)

Measurements were taken with `time.perf_counter()` around preprocessing and `reader.readtext()` per crop, including the grayscale path and, when used, a fallback pass on color-upscaled crops.

### Per-crop timings

| Stage | Min | Median | Max |
|-------|-----|--------|-----|
| Preprocessing (upscale + CLAHE + sharpen) | ~0 ms | **1 ms** | ~30 ms |
| OCR inference (EasyOCR) | ~296 ms | **~613 ms** | ~25,464 ms |
| **Total per crop** | ~297 ms | **~614 ms** | ~25,469 ms |

- **Average total per crop:** ~**846 ms**
- **Wall time for all 214 crops (one full run):** ~**181 s** (~3 minutes), excluding one-time model load

### Interpretation

- Preprocessing is negligible compared to inference.
- Inference dominates; typical “good” crops often complete OCR in **~300 ms**; slower cases often involve harder crops or the fallback color pass.
- The **max** value is driven by the huge `IMG_3884` crop; typical crops stay under ~1.3 s on this machine.
- **GPU** would reduce OCR time substantially (often an order-of-magnitude improvement in desktop setups). **On-device** mobile APIs (ML Kit, Vision) are optimized for latency and power.

## How to reproduce

```bash
cd model_training
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
# Tesseract (optional, for older experiments): brew install tesseract
python test_ocr_extraction.py
```

The script prints per-row timings (`Pre ms`, `OCR ms`) and summary latency statistics at the end.

## Files

| Path | Role |
|------|------|
| `test_ocr_extraction.py` | Crop → preprocess → EasyOCR → sanitize → report + timing |
| `requirements.txt` | Includes `easyocr`, `pytesseract`, OpenCV, etc. |
| `ocr_test_results/` | Saved preprocessed crops (generated at run time) |

---

*Last updated from the Stride-2 OCR evaluation runs (EasyOCR on CPU, English `Reader`).*
