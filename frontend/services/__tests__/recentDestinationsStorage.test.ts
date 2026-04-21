import * as SecureStore from "expo-secure-store";
import type { LandmarkResult } from "../api";
import {
  clearRecentDestinations,
  loadRecentDestinations,
  upsertRecentDestination,
} from "../recentDestinationsStorage";

function createLandmark(id: number, name: string): LandmarkResult {
  return {
    landmark_id: id,
    name,
    floor_number: 1,
    nearest_node: `node_${id}`,
  };
}

describe("recentDestinationsStorage", () => {
  beforeEach(async () => {
    (SecureStore as any).__resetStore();
    await clearRecentDestinations();
  });

  it("returns empty list when no recents are stored", async () => {
    const result = await loadRecentDestinations();
    expect(result).toEqual([]);
  });

  it("stores newest destination first", async () => {
    await upsertRecentDestination(createLandmark(1, "Library"));
    const updated = await upsertRecentDestination(createLandmark(2, "Cafeteria"));

    expect(updated.map((item) => item.landmark_id)).toEqual([2, 1]);
  });

  it("de-duplicates by landmark_id and promotes existing item", async () => {
    await upsertRecentDestination(createLandmark(1, "Library"));
    await upsertRecentDestination(createLandmark(2, "Cafeteria"));
    const updated = await upsertRecentDestination(createLandmark(1, "Library"));

    expect(updated.map((item) => item.landmark_id)).toEqual([1, 2]);
  });

  it("caps recents to 10 items", async () => {
    for (let id = 1; id <= 12; id += 1) {
      await upsertRecentDestination(createLandmark(id, `Room ${id}`));
    }

    const loaded = await loadRecentDestinations();
    expect(loaded).toHaveLength(10);
    expect(loaded[0]?.landmark_id).toBe(12);
    expect(loaded[9]?.landmark_id).toBe(3);
  });

  it("filters malformed persisted payloads", async () => {
    await SecureStore.setItemAsync(
      "recentDestinations",
      JSON.stringify([
        createLandmark(1, "Library"),
        { landmark_id: 2, name: "Missing fields" },
        "invalid",
      ]),
    );

    const loaded = await loadRecentDestinations();
    expect(loaded).toEqual([createLandmark(1, "Library")]);
  });
});
