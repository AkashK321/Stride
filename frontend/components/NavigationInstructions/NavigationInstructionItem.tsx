import * as React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { NavigationInstruction } from "../../services/api";
import { colors } from "../../theme/colors";
import { typography } from "../../theme/typography";
import { spacing } from "../../theme/spacing";

export interface NavigationInstructionItemProps {
  instruction: NavigationInstruction;
  nextInstruction?: NavigationInstruction | null;
}

type DoorSide = "left" | "right";

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

export function formatHeadingBadge(headingDegrees: number | null): string | null {
  if (headingDegrees === null) return null;
  const normalized = Math.round(normalizeHeadingDegrees(headingDegrees));
  return `${normalized}° ${headingToCompassLabel(normalized)}`;
}

function getDoorSide(
  direction: string | null,
  turnIntent: NavigationInstruction["turn_intent"] | null,
): DoorSide | null {
  const sideFromDirection = getDoorSideFromDirection(direction);
  if (sideFromDirection) {
    return sideFromDirection;
  }
  if (turnIntent === "left" || turnIntent === "right") {
    return turnIntent;
  }
  return null;
}

export function formatDoorSideCue(
  direction: string | null,
  turnIntent: NavigationInstruction["turn_intent"] | null = null,
): string | null {
  const doorSide = getDoorSide(direction, turnIntent);
  if (doorSide === "left") return "Destination on your left";
  if (doorSide === "right") return "Destination on your right";
  return null;
}

export function formatInstruction(
  current: NavigationInstruction,
): string {
  const { distance_feet, step_type, turn_intent } = current;
  const roundedDistance = Math.round(distance_feet / 5) * 5;
  const distanceText = `${roundedDistance} ft`;
  const doorCue = formatDoorSideCue(current.direction, current.turn_intent);

  // Arrival handling
  if (step_type === "arrival") {
    return doorCue
      ? `In ${distanceText}, you will arrive. ${doorCue}.`
      : `In ${distanceText}, you will arrive`;
  }

  if (turn_intent === "straight") {
    return `In ${distanceText}, continue straight`;
  }
  if (turn_intent === "around") {
    return `In ${distanceText}, turn around`;
  }
  if (turn_intent === "left" || turn_intent === "right") {
    return `In ${distanceText}, turn ${turn_intent}`;
  }

  return `Continue for ${distanceText}`;
}

export default function NavigationInstructionItem({
  instruction,
}: NavigationInstructionItemProps) {
  const { distance_feet, step_type, turn_intent, direction, heading_degrees } =
    instruction;
  const roundedDistance = Math.round(distance_feet / 5) * 5;
  const distanceText = `${roundedDistance} ft`;
  const doorCue = formatDoorSideCue(direction, turn_intent);
  const headingBadge = formatHeadingBadge(heading_degrees);
  const doorSide = getDoorSide(direction, turn_intent);

  let iconName: React.ComponentProps<typeof Ionicons>["name"] = "arrow-up";
  let turnLabel = "Continue";
  let doorIconName: React.ComponentProps<typeof Ionicons>["name"] =
    "location-outline";

  if (step_type === "arrival") {
    iconName = "flag-outline";
    turnLabel = "Destination";
  } else if (turn_intent === "left") {
    iconName = "arrow-back-outline";
    turnLabel = "Turn left";
  } else if (turn_intent === "right") {
    iconName = "arrow-forward-outline";
    turnLabel = "Turn right";
  } else if (turn_intent === "around") {
    iconName = "refresh-outline";
    turnLabel = "Turn around";
  } else if (turn_intent === "straight") {
    iconName = "arrow-up-outline";
    turnLabel = "Continue straight";
  }
  if (doorSide === "left") {
    doorIconName = "arrow-back-circle-outline";
  } else if (doorSide === "right") {
    doorIconName = "arrow-forward-circle-outline";
  }

  return React.createElement(
    View,
    { style: styles.item },
    React.createElement(
      View,
      { style: styles.itemTextContainer },
      React.createElement(
        View,
        { style: styles.directionRow },
        React.createElement(Ionicons, {
          name: iconName,
          size: 32,
          color: colors.text,
          style: styles.directionIcon,
        }),
        React.createElement(
          View,
          { style: styles.textAndDistance },
          React.createElement(
            Text,
            { style: styles.turnLabel },
            turnLabel,
          ),
          React.createElement(
            Text,
            { style: styles.distanceText },
            distanceText,
          ),
        ),
      ),
      (headingBadge || doorCue) &&
      React.createElement(
        View,
        { style: styles.metaRow },
        headingBadge &&
        React.createElement(
          View,
          {
            style: styles.metaBadge,
            accessibilityLabel: `Heading ${headingBadge}`,
          },
          React.createElement(Ionicons, {
            name: "compass-outline",
            size: 16,
            color: colors.textSecondary,
            style: styles.metaIcon,
          }),
          React.createElement(
            Text,
            { style: styles.metaBadgeText },
            headingBadge,
          ),
        ),
        doorCue &&
        React.createElement(
          View,
          {
            style: styles.metaBadge,
            accessibilityLabel: doorCue,
          },
          React.createElement(Ionicons, {
            name: doorIconName,
            size: 16,
            color: colors.textSecondary,
            style: styles.metaIcon,
          }),
          React.createElement(
            Text,
            { style: styles.metaBadgeText },
            doorCue,
          ),
        ),
      ),
      React.createElement(View, { style: styles.divider }),
    ),
  );
}

const styles = StyleSheet.create({
  item: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  itemTextContainer: {
    flex: 1,
  },
  directionRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  directionIcon: {
    marginRight: spacing.sm,
  },
  textAndDistance: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: spacing.sm,
    gap: spacing.xs,
  },
  metaBadge: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    backgroundColor: colors.backgroundSecondary,
  },
  metaIcon: {
    marginRight: 4,
  },
  metaBadgeText: {
    ...typography.label,
    color: colors.textSecondary,
    fontSize: 14,
  },
  turnLabel: {
    ...typography.body,
    fontSize: 20,
    lineHeight: 26,
    color: colors.text,
  },
  distanceText: {
    ...typography.label,
    fontSize: 18,
    color: colors.textSecondary,
  },
  divider: {
    marginTop: spacing.md,
    height: StyleSheet.hairlineWidth * 2,
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 1,
    alignSelf: "stretch",
  },
  metaText: {
    ...typography.label,
    color: colors.textSecondary,
    marginTop: 2,
  },
});
