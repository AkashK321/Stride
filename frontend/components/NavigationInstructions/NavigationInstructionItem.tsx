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

function normalizeDirection(dir: string | null | undefined): string | null {
  if (!dir) return null;
  const lower = dir.trim().toLowerCase();

  // Handle phrases like "Head North", "head east", etc.
  if (lower.includes("north")) return "north";
  if (lower.includes("east")) return "east";
  if (lower.includes("south")) return "south";
  if (lower.includes("west")) return "west";

  // Handle explicit relative directions if they ever appear
  if (lower.includes("left")) return "left";
  if (lower.includes("right")) return "right";
  if (lower.includes("straight")) return "straight";

  return lower;
}

function getRelativeTurn(
  currentDir: string | null | undefined,
  nextDir: string | null | undefined,
): "left" | "right" | "around" | "straight" | null {
  const current = normalizeDirection(currentDir);
  const next = normalizeDirection(nextDir);
  if (!current || !next) return null;
  if (current === next) return "straight";

  const order = ["north", "east", "south", "west"] as const;
  const fromIdx = order.indexOf(current as (typeof order)[number]);
  const toIdx = order.indexOf(next as (typeof order)[number]);
  if (fromIdx === -1 || toIdx === -1) return null;

  const delta = (toIdx - fromIdx + order.length) % order.length;
  if (delta === 1) return "right";
  if (delta === 3) return "left";
  if (delta === 2) return "around";
  return null;
}

export function formatInstruction(
  current: NavigationInstruction,
  next?: NavigationInstruction | null,
): string {
  const { direction, distance_feet } = current;
  const roundedDistance = Math.round(distance_feet / 5) * 5;
  const distanceText = `${roundedDistance} ft`;

  // Arrival handling
  if (direction === "arrive" || next?.direction === "arrive") {
    return `In ${distanceText}, you will arrive`;
  }

  // If we don't have a "next" step, fall back to a simple walk instruction
  if (!next) {
    if (!direction) {
      return `Continue for ${distanceText}`;
    }
    const dir =
      direction.charAt(0).toUpperCase() + direction.slice(1).toLowerCase();
    return `Walk ${dir} for ${distanceText}`;
  }

  const relativeTurn = getRelativeTurn(direction, next.direction);
  if (relativeTurn === "straight") {
    return `In ${distanceText}, continue straight`;
  }
  if (relativeTurn === "around") {
    return `In ${distanceText}, turn around`;
  }
  if (relativeTurn === "left" || relativeTurn === "right") {
    return `In ${distanceText}, turn ${relativeTurn}`;
  }

  // Fallback when we can't determine a relative turn
  if (next.direction) {
    const nextDir =
      next.direction.charAt(0).toUpperCase() +
      next.direction.slice(1).toLowerCase();
    return `In ${distanceText}, turn ${nextDir.toLowerCase()}`;
  }

  return `Continue for ${distanceText}`;
}

export default function NavigationInstructionItem({
  instruction,
  nextInstruction,
}: NavigationInstructionItemProps) {
  const { direction, distance_feet } = instruction;
  const roundedDistance = Math.round(distance_feet / 5) * 5;
  const distanceText = `${roundedDistance} ft`;

  const relativeTurn = getRelativeTurn(direction, nextInstruction?.direction);

  let iconName: React.ComponentProps<typeof Ionicons>["name"] = "arrow-up";
  let turnLabel = "Continue";

  if (direction === "arrive" || nextInstruction?.direction === "arrive") {
    iconName = "flag-outline";
    turnLabel = "Destination";
  } else if (relativeTurn === "left") {
    iconName = "arrow-back-outline";
    turnLabel = "Turn left";
  } else if (relativeTurn === "right") {
    iconName = "arrow-forward-outline";
    turnLabel = "Turn right";
  } else if (relativeTurn === "around") {
    iconName = "refresh-outline";
    turnLabel = "Turn around";
  } else if (relativeTurn === "straight") {
    iconName = "arrow-up-outline";
    turnLabel = "Continue straight";
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

