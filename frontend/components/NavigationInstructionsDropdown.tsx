import * as React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
} from "react-native";
import { NavigationInstruction } from "../services/api";
import { colors } from "../theme/colors";
import { typography } from "../theme/typography";
import { spacing } from "../theme/spacing";

export interface NavigationInstructionsDropdownProps {
  instructions: NavigationInstruction[];
  onExit: () => void;
}

export default function NavigationInstructionsDropdown({
  instructions,
  onExit,
}: NavigationInstructionsDropdownProps) {
  const [expanded, setExpanded] = React.useState(true);

  return React.createElement(
    View,
    { style: styles.container },
    React.createElement(
      Pressable,
      {
        style: styles.header,
        onPress: () => setExpanded((prev) => !prev),
        accessibilityRole: "button",
        accessibilityLabel: "Toggle navigation steps",
      },
      React.createElement(
        Text,
        { style: styles.title },
        "Navigation steps",
      ),
      React.createElement(
        Text,
        { style: styles.count },
        `${instructions.length} step${instructions.length === 1 ? "" : "s"}`,
      ),
      React.createElement(
        Text,
        { style: styles.chevron },
        expanded ? "▾" : "▴",
      ),
    ),
    expanded &&
      React.createElement(
        ScrollView,
        {
          style: styles.list,
          contentContainerStyle: styles.listContent,
        },
        instructions.map((instruction) =>
          React.createElement(
            View,
            { key: String(instruction.step), style: styles.item },
            React.createElement(
              Text,
              { style: styles.stepNumber },
              `${instruction.step}`,
            ),
            React.createElement(
              View,
              { style: styles.itemTextContainer },
              React.createElement(
                Text,
                { style: styles.instructionText },
                formatInstruction(instruction),
              ),
              React.createElement(
                Text,
                { style: styles.metaText },
                `${instruction.distance_feet.toFixed(1)} ft • ${instruction.node_id}`,
              ),
            ),
          ),
        ),
      ),
    React.createElement(
      Pressable,
      {
        style: styles.exitButton,
        onPress: onExit,
        accessibilityRole: "button",
        accessibilityLabel: "Exit navigation",
      },
      React.createElement(
        Text,
        { style: styles.exitButtonText },
        "Exit navigation",
      ),
    ),
  );
}

function formatInstruction(instruction: NavigationInstruction): string {
  const { direction, distance_feet } = instruction;
  if (!direction) {
    return `Continue for ${distance_feet.toFixed(1)} ft`;
  }
  const dir =
    direction.charAt(0).toUpperCase() + direction.slice(1).toLowerCase();
  return `Walk ${dir} for ${distance_feet.toFixed(1)} ft`;
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.background,
    borderRadius: 12,
    margin: spacing.md,
    padding: spacing.sm,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  title: {
    ...typography.label,
    color: colors.text,
    flexShrink: 1,
  },
  count: {
    ...typography.label,
    color: colors.textSecondary,
    marginLeft: spacing.xs,
    flexGrow: 1,
  },
  chevron: {
    ...typography.label,
    color: colors.textSecondary,
  },
  list: {
    maxHeight: 260,
    marginTop: spacing.xs,
  },
  listContent: {
    paddingBottom: spacing.xs,
  },
  item: {
    flexDirection: "row",
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: 8,
    backgroundColor: colors.backgroundSecondary,
    marginBottom: spacing.xs,
  },
  stepNumber: {
    ...typography.label,
    color: colors.textSecondary,
    marginRight: spacing.sm,
    width: 20,
    textAlign: "center",
  },
  itemTextContainer: {
    flex: 1,
  },
  instructionText: {
    ...typography.body,
    color: colors.text,
  },
  metaText: {
    ...typography.label,
    color: colors.textSecondary,
    marginTop: 2,
  },
  exitButton: {
    marginTop: spacing.sm,
    alignSelf: "flex-end",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 999,
    backgroundColor: colors.backgroundSecondary,
  },
  exitButtonText: {
    ...typography.label,
    color: colors.primary,
  },
});

