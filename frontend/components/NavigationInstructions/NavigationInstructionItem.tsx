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

export function formatInstruction(
  current: NavigationInstruction,
): string {
  const { direction, distance_feet, turn_at_end } = current;
  const roundedDistance = Math.round(distance_feet / 5) * 5;
  const distanceText = `${roundedDistance} ft`;

  // Arrival handling
  if (direction === "arrive") {
    return `In ${distanceText}, you will arrive`;
  }

  if (turn_at_end === "straight") {
    return `In ${distanceText}, continue straight`;
  }
  if (turn_at_end === "around") {
    return `In ${distanceText}, turn around`;
  }
  if (turn_at_end === "left" || turn_at_end === "right") {
    return `In ${distanceText}, turn ${turn_at_end}`;
  }

  return `Continue for ${distanceText}`;
}

export default function NavigationInstructionItem({
  instruction,
  nextInstruction,
}: NavigationInstructionItemProps) {
  const { direction, distance_feet, turn_at_end } = instruction;
  const roundedDistance = Math.round(distance_feet / 5) * 5;
  const distanceText = `${roundedDistance} ft`;

  let iconName: React.ComponentProps<typeof Ionicons>["name"] = "arrow-up";
  let turnLabel = "Continue";

  if (direction === "arrive") {
    iconName = "flag-outline";
    turnLabel = "Destination";
  } else if (turn_at_end === "left") {
    iconName = "arrow-back-outline";
    turnLabel = "Turn left";
  } else if (turn_at_end === "right") {
    iconName = "arrow-forward-outline";
    turnLabel = "Turn right";
  } else if (turn_at_end === "around") {
    iconName = "refresh-outline";
    turnLabel = "Turn around";
  } else if (turn_at_end === "straight") {
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

