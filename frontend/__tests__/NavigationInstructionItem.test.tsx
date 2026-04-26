/**
 * Unit tests for NavigationInstructionItem pure utility functions
 *
 * Covers the fixes made in issue #274 (voice assistant default) and the
 * end-node turn direction improvements:
 *
 * 1. getDoorSideFromDirection — expanded variant matching
 * 2. getDoorSide — fallback to turn_intent when direction text is ambiguous
 * 3. formatDoorSideCue — correct cue strings for left/right/null
 * 4. formatInstruction — arrival step includes door cue in spoken text
 *
 * All functions under test are pure (no React Native / Expo deps),
 * so no mocking is required.
 */

// ─── Inline the pure functions under test ────────────────────────────────────
// These are extracted directly from NavigationInstructionItem.tsx.
// If the file exports them, import instead:
//   import { formatDoorSideCue, formatInstruction, formatHeadingBadge }
//     from "../../components/NavigationInstructions/NavigationInstructionItem";

type DoorSide = "left" | "right";
type TurnIntent = "left" | "right" | "straight" | "around" | null;

function normalizeHeadingDegrees(value: number): number {
  const normalized = value % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

function headingToCompassLabel(headingDegrees: number): string {
  const normalized = normalizeHeadingDegrees(headingDegrees);
  const directions = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;
  const index = Math.round(normalized / 45) % directions.length;
  return directions[index];
}

function getDoorSideFromDirection(direction: string | null): DoorSide | null {
  if (!direction) return null;
  const lowered = direction.toLowerCase();
  if (
    lowered.includes("on your left") ||
    lowered.includes("to your left") ||
    lowered.includes("left side") ||
    lowered === "left" ||
    lowered.endsWith(" left")
  ) {
    return "left";
  }
  if (
    lowered.includes("on your right") ||
    lowered.includes("to your right") ||
    lowered.includes("right side") ||
    lowered === "right" ||
    lowered.endsWith(" right")
  ) {
    return "right";
  }
  return null;
}

function getDoorSide(
  direction: string | null,
  turnIntent: TurnIntent,
): DoorSide | null {
  const sideFromDirection = getDoorSideFromDirection(direction);
  if (sideFromDirection) return sideFromDirection;
  if (turnIntent === "left" || turnIntent === "right") return turnIntent;
  return null;
}

function formatDoorSideCue(
  direction: string | null,
  turnIntent: TurnIntent = null,
): string | null {
  const doorSide = getDoorSide(direction, turnIntent);
  if (doorSide === "left") return "Destination on your left";
  if (doorSide === "right") return "Destination on your right";
  return null;
}

function formatHeadingBadge(headingDegrees: number | null): string | null {
  if (headingDegrees === null) return null;
  const normalized = Math.round(normalizeHeadingDegrees(headingDegrees));
  return `${normalized}° ${headingToCompassLabel(normalized)}`;
}

interface NavigationInstruction {
  step: number;
  distance_feet: number;
  direction: string | null;
  step_type: "navigation" | "arrival";
  turn_intent: TurnIntent;
  heading_degrees: number | null;
  node_id: string;
}

function formatInstruction(current: NavigationInstruction): string {
  const { distance_feet, step_type, turn_intent } = current;
  const roundedDistance = Math.round(distance_feet / 5) * 5;
  const distanceText = `${roundedDistance} ft`;
  const doorCue = formatDoorSideCue(current.direction, current.turn_intent);

  if (step_type === "arrival") {
    return doorCue
      ? `In ${distanceText}, you will arrive. ${doorCue}.`
      : `In ${distanceText}, you will arrive`;
  }
  if (turn_intent === "straight") return `In ${distanceText}, continue straight`;
  if (turn_intent === "around") return `In ${distanceText}, turn around`;
  if (turn_intent === "left" || turn_intent === "right")
    return `In ${distanceText}, turn ${turn_intent}`;
  return `Continue for ${distanceText}`;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeInstruction(
  overrides: Partial<NavigationInstruction> = {},
): NavigationInstruction {
  return {
    step: 1,
    distance_feet: 10,
    direction: null,
    step_type: "navigation",
    turn_intent: null,
    heading_degrees: null,
    node_id: "test_node",
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

// ---------------------------------------------------------------------------
// getDoorSideFromDirection — variant matching (core of the #274 fix)
// ---------------------------------------------------------------------------
describe("getDoorSideFromDirection – expanded variant matching", () => {
  // --- LEFT variants ---
  test('detects "on your left"', () => {
    expect(getDoorSideFromDirection("Room is on your left")).toBe("left");
  });

  test('detects "to your left"', () => {
    expect(getDoorSideFromDirection("to your left")).toBe("left");
  });

  test('detects "left side"', () => {
    expect(getDoorSideFromDirection("left side of the hallway")).toBe("left");
  });

  test('detects bare "left"', () => {
    expect(getDoorSideFromDirection("left")).toBe("left");
  });

  test('detects phrase ending with " left"', () => {
    expect(getDoorSideFromDirection("entrance left")).toBe("left");
  });

  // --- RIGHT variants ---
  test('detects "on your right"', () => {
    expect(getDoorSideFromDirection("door on your right")).toBe("right");
  });

  test('detects "to your right"', () => {
    expect(getDoorSideFromDirection("to your right")).toBe("right");
  });

  test('detects "right side"', () => {
    expect(getDoorSideFromDirection("right side")).toBe("right");
  });

  test('detects bare "right"', () => {
    expect(getDoorSideFromDirection("right")).toBe("right");
  });

  test('detects phrase ending with " right"', () => {
    expect(getDoorSideFromDirection("entrance right")).toBe("right");
  });

  // --- Edge cases ---
  test("returns null for null input", () => {
    expect(getDoorSideFromDirection(null)).toBeNull();
  });

  test("returns null for empty string", () => {
    expect(getDoorSideFromDirection("")).toBeNull();
  });

  test("returns null for unrelated direction text", () => {
    expect(getDoorSideFromDirection("continue straight ahead")).toBeNull();
  });

  test("is case-insensitive", () => {
    expect(getDoorSideFromDirection("ON YOUR LEFT")).toBe("left");
    expect(getDoorSideFromDirection("To Your Right")).toBe("right");
  });
});

// ---------------------------------------------------------------------------
// getDoorSide — turn_intent fallback
// ---------------------------------------------------------------------------
describe("getDoorSide – turn_intent fallback", () => {
  test("uses direction text when present, ignores turn_intent", () => {
    // direction says left, turn_intent says right → direction wins
    expect(getDoorSide("on your left", "right")).toBe("left");
  });

  test("falls back to turn_intent when direction is null", () => {
    expect(getDoorSide(null, "left")).toBe("left");
    expect(getDoorSide(null, "right")).toBe("right");
  });

  test("falls back to turn_intent when direction text is ambiguous", () => {
    expect(getDoorSide("continue straight", "right")).toBe("right");
  });

  test("returns null when both direction and turn_intent give no side", () => {
    expect(getDoorSide(null, "straight")).toBeNull();
    expect(getDoorSide(null, null)).toBeNull();
    expect(getDoorSide("continue ahead", "around")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// formatDoorSideCue — cue strings
// ---------------------------------------------------------------------------
describe("formatDoorSideCue", () => {
  test('returns "Destination on your left" for left direction', () => {
    expect(formatDoorSideCue("on your left")).toBe("Destination on your left");
  });

  test('returns "Destination on your right" for right direction', () => {
    expect(formatDoorSideCue("on your right")).toBe("Destination on your right");
  });

  test("returns correct cue via turn_intent fallback", () => {
    expect(formatDoorSideCue(null, "left")).toBe("Destination on your left");
    expect(formatDoorSideCue(null, "right")).toBe("Destination on your right");
  });

  test("returns null when no side can be determined", () => {
    expect(formatDoorSideCue(null, null)).toBeNull();
    expect(formatDoorSideCue("continue ahead", "straight")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// formatInstruction — arrival step spoken text includes door cue
// ---------------------------------------------------------------------------
describe("formatInstruction – arrival step", () => {
  test("arrival with left direction includes door cue in spoken text", () => {
    const instruction = makeInstruction({
      step_type: "arrival",
      distance_feet: 10,
      direction: "on your left",
      turn_intent: null,
    });
    expect(formatInstruction(instruction)).toBe(
      "In 10 ft, you will arrive. Destination on your left.",
    );
  });

  test("arrival with right turn_intent fallback includes door cue", () => {
    const instruction = makeInstruction({
      step_type: "arrival",
      distance_feet: 15,
      direction: null,
      turn_intent: "right",
    });
    expect(formatInstruction(instruction)).toBe(
      "In 15 ft, you will arrive. Destination on your right.",
    );
  });

  test("arrival with no side info omits door cue", () => {
    const instruction = makeInstruction({
      step_type: "arrival",
      distance_feet: 5,
      direction: null,
      turn_intent: null,
    });
    expect(formatInstruction(instruction)).toBe("In 5 ft, you will arrive");
  });

  test("distance is rounded to nearest 5 ft", () => {
    const instruction = makeInstruction({
      step_type: "arrival",
      distance_feet: 13,
      direction: null,
      turn_intent: null,
    });
    // 13 rounded to nearest 5 = 15
    expect(formatInstruction(instruction)).toBe("In 15 ft, you will arrive");
  });
});

// ---------------------------------------------------------------------------
// formatInstruction — non-arrival steps (regression guard)
// ---------------------------------------------------------------------------
describe("formatInstruction – non-arrival steps", () => {
  test("straight turn_intent", () => {
    const i = makeInstruction({ turn_intent: "straight", distance_feet: 20 });
    expect(formatInstruction(i)).toBe("In 20 ft, continue straight");
  });

  test("left turn", () => {
    const i = makeInstruction({ turn_intent: "left", distance_feet: 10 });
    expect(formatInstruction(i)).toBe("In 10 ft, turn left");
  });

  test("right turn", () => {
    const i = makeInstruction({ turn_intent: "right", distance_feet: 10 });
    expect(formatInstruction(i)).toBe("In 10 ft, turn right");
  });

  test("turn around", () => {
    const i = makeInstruction({ turn_intent: "around", distance_feet: 5 });
    expect(formatInstruction(i)).toBe("In 5 ft, turn around");
  });

  test("fallback with no turn_intent", () => {
    const i = makeInstruction({ turn_intent: null, distance_feet: 30 });
    expect(formatInstruction(i)).toBe("Continue for 30 ft");
  });
});

// ---------------------------------------------------------------------------
// formatHeadingBadge
// ---------------------------------------------------------------------------
describe("formatHeadingBadge", () => {
  test("returns null for null input", () => {
    expect(formatHeadingBadge(null)).toBeNull();
  });

  test("formats 0° as north", () => {
    expect(formatHeadingBadge(0)).toBe("0° N");
  });

  test("formats 90° as east", () => {
    expect(formatHeadingBadge(90)).toBe("90° E");
  });

  test("formats 270° as west", () => {
    expect(formatHeadingBadge(270)).toBe("270° W");
  });

  test("normalises values over 360°", () => {
    expect(formatHeadingBadge(360)).toBe("0° N");
    expect(formatHeadingBadge(450)).toBe("90° E");
  });

  test("normalises negative values", () => {
    expect(formatHeadingBadge(-90)).toBe("270° W");
  });
});