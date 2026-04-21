import * as SecureStore from "expo-secure-store";
import type { LandmarkResult } from "./api";

const RECENT_DESTINATIONS_KEY = "recentDestinations";
const MAX_RECENT_DESTINATIONS = 10;

export type RecentDestination = Pick<
  LandmarkResult,
  "landmark_id" | "name" | "floor_number" | "nearest_node"
>;

function isValidRecentDestination(value: unknown): value is RecentDestination {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<RecentDestination>;
  return (
    typeof candidate.landmark_id === "number" &&
    Number.isFinite(candidate.landmark_id) &&
    typeof candidate.name === "string" &&
    candidate.name.trim().length > 0 &&
    typeof candidate.floor_number === "number" &&
    Number.isFinite(candidate.floor_number) &&
    typeof candidate.nearest_node === "string" &&
    candidate.nearest_node.trim().length > 0
  );
}

function normalizeRecentDestinations(
  list: unknown,
  maxItems: number = MAX_RECENT_DESTINATIONS,
): RecentDestination[] {
  if (!Array.isArray(list)) {
    return [];
  }

  const seen = new Set<number>();
  const normalized: RecentDestination[] = [];

  for (const item of list) {
    if (!isValidRecentDestination(item)) {
      continue;
    }
    if (seen.has(item.landmark_id)) {
      continue;
    }

    seen.add(item.landmark_id);
    normalized.push({
      landmark_id: item.landmark_id,
      name: item.name,
      floor_number: item.floor_number,
      nearest_node: item.nearest_node,
    });

    if (normalized.length >= maxItems) {
      break;
    }
  }

  return normalized;
}

export async function loadRecentDestinations(): Promise<RecentDestination[]> {
  try {
    const rawValue = await SecureStore.getItemAsync(RECENT_DESTINATIONS_KEY);
    if (!rawValue) {
      return [];
    }

    const parsed = JSON.parse(rawValue) as unknown;
    return normalizeRecentDestinations(parsed);
  } catch (error) {
    console.warn("Failed to load recent destinations:", error);
    return [];
  }
}

async function saveRecentDestinations(destinations: RecentDestination[]): Promise<void> {
  await SecureStore.setItemAsync(RECENT_DESTINATIONS_KEY, JSON.stringify(destinations));
}

export async function upsertRecentDestination(
  landmark: LandmarkResult,
  maxItems: number = MAX_RECENT_DESTINATIONS,
): Promise<RecentDestination[]> {
  const nextDestination: RecentDestination = {
    landmark_id: landmark.landmark_id,
    name: landmark.name,
    floor_number: landmark.floor_number,
    nearest_node: landmark.nearest_node,
  };

  const existing = await loadRecentDestinations();
  const withoutCurrent = existing.filter(
    (item) => item.landmark_id !== nextDestination.landmark_id,
  );
  const next = [nextDestination, ...withoutCurrent].slice(0, maxItems);

  try {
    await saveRecentDestinations(next);
  } catch (error) {
    console.warn("Failed to persist recent destinations:", error);
  }

  return next;
}

export async function clearRecentDestinations(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(RECENT_DESTINATIONS_KEY);
  } catch (error) {
    console.warn("Failed to clear recent destinations:", error);
  }
}
