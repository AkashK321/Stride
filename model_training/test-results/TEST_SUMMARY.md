# Model Training Test Summary

## Unit Tests

**`test_split_dataset_unit.py`** tests the `split_list()` function from the dataset splitting module, which partitions image-label pairs into train/valid/test sets. It verifies that the 70/20/10 ratio holds across dataset sizes ranging from 1 to 1000, that the fixed random seed produces deterministic results across repeated calls, and that no data is lost or duplicated — all stems are preserved and the three splits are completely disjoint.

**`test_ocr_preprocessing_unit.py`** tests the OCR extraction module's preprocessing pipeline and label parsing. It verifies that `parse_polygon_labels` correctly reads YOLO polygon annotations while skipping malformed lines, that `preprocess_for_ocr` upscales small crops to at least 400px wide and applies CLAHE contrast enhancement to produce a single-channel grayscale output, and that `sanitize_ocr_text` properly extracts room number patterns like "242" or "101A" from noisy OCR output.

## Integration Tests

**`test_split_dataset_integration.py`** exercises the complete dataset split workflow end-to-end by building a fake 20-image Roboflow-style directory with matched image/label pairs, then running the full `collect_pairs` → `split_list` → `move_pairs` pipeline. It verifies that `valid/` and `test/` directories are created with correct file counts (14/4/2), that every image has a matching label in its split, that moved files are actually removed from `train/`, and that orphan files without a matching pair are excluded.

**`test_ocr_pipeline_integration.py`** runs the full OCR chain end-to-end by rendering digits like "242" and "Room 308" onto synthetic images using `cv2.putText`, writing matching polygon label files, then executing the complete label → bounding box → crop → preprocess → EasyOCR → sanitize pipeline. It verifies that EasyOCR successfully reads the rendered text and that `sanitize_ocr_text` extracts the correct room numbers from the raw output.
