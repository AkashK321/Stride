# Room Sign Dataset Template (YOLO)

Use this template to prepare your dataset for Colab training.

## Class mapping

- `0` -> `230`
- `1` -> `232`
- `2` -> `226`
- `3` -> `224`

Set this in your training config:

```python
CLASS_NAMES = ["230", "232", "226", "224"]
```

If you currently do not have images for `224`, use:

```python
CLASS_NAMES = ["230", "232", "226"]
```

## Folder layout

```text
room_sign_dataset_template/
  images/
    train/
    val/
  labels/
    train/
    val/
```

For every image file, create one label file with the same basename:

- `images/train/230_01.jpg` -> `labels/train/230_01.txt`
- `images/val/232_14.jpg` -> `labels/val/232_14.txt`

## How training uses train/val folders

- `images/train` + `labels/train`: used to **learn** model weights.
- `images/val` + `labels/val`: used to **evaluate** after each epoch (no learning on val).

Why both are needed:
- If you only check training images, the model can memorize and look better than it really is.
- Validation checks whether the model generalizes to unseen photos and angles.

## Label format

Each line in a `.txt` file is:

```text
class_id x_center y_center width height
```

All coordinates are normalized from `0` to `1`.

Meaning of each number:
- `class_id`: which room class (`0`, `1`, `2`, `3`, etc.)
- `x_center`: horizontal center of the box (as % of image width)
- `y_center`: vertical center of the box (as % of image height)
- `width`: box width (as % of image width)
- `height`: box height (as % of image height)

Example:

```text
0 0.52 0.44 0.30 0.18
```

This means class `0` (`230`) with a box centered at 52% across and 44% down, sized 30% wide and 18% tall.

If an image has one sign, file has one line.
If an image has multiple signs, add one line per sign.

## What is required for training to work

Training will work if all of these are true:

1. Dataset structure exists exactly:
   - `images/train`, `images/val`, `labels/train`, `labels/val`
2. Every image has a matching label file with same basename:
   - `abc.jpg` -> `abc.txt`
3. Label files use valid YOLO format:
   - `class_id x_center y_center width height`
   - Coordinates are between `0` and `1`
4. `class_id` values match `CLASS_NAMES` indices:
   - With `["230", "232", "226"]`, valid IDs are `0,1,2`
5. Each class has enough examples in both train and val.
6. Images are readable (`.jpg`, `.jpeg`, `.png`) and not corrupted.

Common failure causes:
- Missing `.txt` for some images
- Wrong class IDs (for example using `3` when only 3 classes exist)
- Keeping `224` in classes without any `224` images

## Recommended split with your data

Current counts provided:
- Room `230`: 15 images
- Room `232`: 15 images
- Room `226`: 15 images
- Room `224`: not provided

Use roughly:
- Train: 12 images per class
- Val: 3 images per class

Important: a class needs at least some train and val images. If `224` has no images yet, remove `224` from classes for now OR collect `224` images before training.
