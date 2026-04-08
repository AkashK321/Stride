/**
 * Custom hook for smoothed compass heading and orientation alignment feedback.
 *
 * Subscribes to expo-location heading updates and applies a circular rolling
 * average to reduce magnetometer noise. Exposes a smoothed heading value and
 * a getAlignment() helper that compares the user's current heading against a
 * target bearing from the active navigation instruction.
 *
 * Note: Prefers trueHeading when available; falls back to magHeading indoors
 * where GPS is poor. Both are 0–360° with 0 = North.
 *
 * Tuning constants at the top of the file:
 *   ROLLING_WINDOW        — number of samples in the rolling average (default: 10)
 *   ALIGNED_TOLERANCE_DEG — degrees within which user is considered aligned (default: 20)
 */

import { useEffect, useRef, useState } from "react";
import * as Location from "expo-location";
import { headingDegreesFromExpoHeading } from "../utils/locationHeading";

// --- Tunable constants ---
const ROLLING_WINDOW = 10; // number of samples to average over
const ALIGNED_TOLERANCE_DEG = 20; // degrees within which user is considered "aligned"

export type HeadingAlignment = "aligned" | "turn_left" | "turn_right" | "unknown";

export interface UseHeadingResult {
  /** Smoothed current heading in degrees (0–360, 0 = North). Null until first reading. */
  smoothedHeading: number | null;

  /** Whether the user has granted location permission needed for heading. */
  hasPermission: boolean;
  /**
   * Given a target bearing from the active instruction's heading_degrees,
   * returns whether the user is aligned, needs to turn left, or turn right.
   * Pass null (e.g. on the final "arrive" step) to get "unknown".
   */
  getAlignment: (targetHeading: number | null) => HeadingAlignment;
}

export function useHeading(): UseHeadingResult {
  const [smoothedHeading, setSmoothedHeading] = useState<number | null>(null);
  const [hasPermission, setHasPermission] = useState(false);

  const samplesRef = useRef<number[]>([]);
  const headingWatchRef = useRef<Location.LocationSubscription | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function start() {
      // Request foreground location permission, required for heading on both platforms
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (cancelled) return;

      if (status !== "granted") {
        console.warn("Failed to start heading watch: location permission denied");
        setHasPermission(false);
        return;
      }
      setHasPermission(true);

      // Subscribe to continuous heading updates
      try {
        const headingSub = await Location.watchHeadingAsync((headingData) => {
          if (cancelled) return;

          const raw = headingDegreesFromExpoHeading(headingData);

          // Push into rolling buffer, evict oldest sample when full
          const samples = samplesRef.current;
          samples.push(raw);
          if (samples.length > ROLLING_WINDOW) {
            samples.shift();
          }

          // Circular mean (handles 0°/360° wrap-around correctly)
          // A plain average would give ~180° for samples near 0° and 360°
          const sinSum = samples.reduce((acc, deg) => acc + Math.sin(toRad(deg)), 0);
          const cosSum = samples.reduce((acc, deg) => acc + Math.cos(toRad(deg)), 0);
          const mean = toDeg(Math.atan2(sinSum / samples.length, cosSum / samples.length));
          setSmoothedHeading((mean + 360) % 360);
        });

        headingWatchRef.current = headingSub;
      } catch (e) {
        console.warn("Failed to start heading watch:", e);
      }
    }

    start();

    // Cleanup heading subscription on unmount or navigation exit
    return () => {
      cancelled = true;
      headingWatchRef.current?.remove();
      headingWatchRef.current = null;
      samplesRef.current = [];
    };
  }, []);

  // Compare smoothed heading to a target bearing from the active instruction
  const getAlignment = (targetHeading: number | null): HeadingAlignment => {
    if (targetHeading == null || smoothedHeading == null) return "unknown";

    // Signed shortest angular difference — negative = turn left, positive = turn right
    const diff = angularDiff(smoothedHeading, targetHeading);

    if (Math.abs(diff) <= ALIGNED_TOLERANCE_DEG) return "aligned";
    return diff < 0 ? "turn_left" : "turn_right";
  };

  return { smoothedHeading, hasPermission, getAlignment };
}

// Helpers 

function toRad(deg: number) {
  return (deg * Math.PI) / 180;
}

function toDeg(rad: number) {
  return (rad * 180) / Math.PI;
}

function angularDiff(current: number, target: number): number {
  return ((target - current + 540) % 360) - 180;
}