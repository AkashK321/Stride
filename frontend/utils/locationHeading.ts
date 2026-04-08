import type { LocationHeadingObject } from "expo-location";

/**
 * Prefer true north when the platform reports it (trueHeading >= 0);
 * otherwise use magnetic heading — same policy as navigation frame snapshots.
 */
export function headingDegreesFromExpoHeading(heading: LocationHeadingObject): number {
  const trueH = heading.trueHeading;
  if (trueH != null && trueH >= 0) {
    return trueH;
  }
  return heading.magHeading;
}
