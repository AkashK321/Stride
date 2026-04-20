from floor_data.registry import get_all_buildings_data, validate_registered_floors


def test_registry_assembles_building_payloads():
    all_buildings = get_all_buildings_data()
    assert len(all_buildings) > 0

    bhee = next((b for b in all_buildings if b["building_id"] == "B01"), None)
    assert bhee is not None
    assert bhee["building_name"] == "BHEE"
    assert len(bhee["floors"]) >= 1
    assert [floor["floor_number"] for floor in bhee["floors"]] == sorted(
        floor["floor_number"] for floor in bhee["floors"]
    )


def test_registered_floor_validators_run():
    # Should not raise for currently registered floor packages.
    validate_registered_floors()
