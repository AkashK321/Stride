"""
Unit tests for model_training/split_dataset.py

Tests the split_list() function in isolation — ratio correctness,
determinism with the fixed seed, no duplicates, and no data loss.
"""

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))
import split_dataset as sd


class TestSplitListRatios:
    """Verify train/valid/test proportions match 70/20/10."""

    def test_100_items_produces_correct_counts(self):
        stems = [f"img_{i:04d}" for i in range(100)]
        splits = sd.split_list(stems)

        assert len(splits["train"]) == 70
        assert len(splits["valid"]) == 20
        assert len(splits["test"]) == 10

    def test_small_dataset_still_splits(self):
        stems = [f"img_{i}" for i in range(5)]
        splits = sd.split_list(stems)

        total = len(splits["train"]) + len(splits["valid"]) + len(splits["test"])
        assert total == 5
        assert len(splits["train"]) >= 1

    def test_single_item_assigned_to_one_split(self):
        splits = sd.split_list(["only_one"])
        total = len(splits["train"]) + len(splits["valid"]) + len(splits["test"])
        assert total == 1

    def test_large_dataset_ratios_within_tolerance(self):
        stems = [f"img_{i:05d}" for i in range(1000)]
        splits = sd.split_list(stems)
        n = 1000

        train_ratio = len(splits["train"]) / n
        valid_ratio = len(splits["valid"]) / n
        test_ratio = len(splits["test"]) / n

        assert abs(train_ratio - 0.70) < 0.01
        assert abs(valid_ratio - 0.20) < 0.01
        assert abs(test_ratio - 0.10) < 0.01


class TestSplitListDeterminism:
    """Verify the fixed seed produces identical results across calls."""

    def test_two_calls_produce_identical_splits(self):
        stems = [f"img_{i:04d}" for i in range(50)]
        first = sd.split_list(list(stems))
        second = sd.split_list(list(stems))

        assert first["train"] == second["train"]
        assert first["valid"] == second["valid"]
        assert first["test"] == second["test"]

    def test_same_input_same_output(self):
        stems = [f"img_{i:04d}" for i in range(30)]
        first = sd.split_list(list(stems))
        second = sd.split_list(list(stems))

        assert first["train"] == second["train"]
        assert first["valid"] == second["valid"]
        assert first["test"] == second["test"]


class TestSplitListIntegrity:
    """Verify no data loss and no duplicates across splits."""

    def test_no_duplicates_across_splits(self):
        stems = [f"img_{i:04d}" for i in range(80)]
        splits = sd.split_list(stems)

        all_items = splits["train"] + splits["valid"] + splits["test"]
        assert len(all_items) == len(set(all_items))

    def test_all_stems_preserved(self):
        stems = [f"img_{i:04d}" for i in range(80)]
        original_set = set(stems)
        splits = sd.split_list(list(stems))

        recombined = set(splits["train"] + splits["valid"] + splits["test"])
        assert recombined == original_set

    def test_splits_are_disjoint(self):
        stems = [f"img_{i:04d}" for i in range(60)]
        splits = sd.split_list(stems)

        train_set = set(splits["train"])
        valid_set = set(splits["valid"])
        test_set = set(splits["test"])

        assert train_set.isdisjoint(valid_set)
        assert train_set.isdisjoint(test_set)
        assert valid_set.isdisjoint(test_set)

    def test_returns_three_keys(self):
        splits = sd.split_list(["a", "b", "c"])
        assert set(splits.keys()) == {"train", "valid", "test"}
