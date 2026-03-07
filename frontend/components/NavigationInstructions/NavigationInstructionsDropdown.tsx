import * as React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Dimensions,
  Animated,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { NavigationInstruction } from "../../services/api";
import { colors } from "../../theme/colors";
import { typography } from "../../theme/typography";
import { spacing } from "../../theme/spacing";
import NavigationInstructionItem, {
  formatInstruction,
} from "./NavigationInstructionItem";

const MAX_DROPDOWN_HEIGHT = Dimensions.get("window").height * 0.45;
const ROW_HEIGHT = 80; // approximate height per instruction row

function normalizeDirection(dir: string | null | undefined): string | null {
  if (!dir) return null;
  const lower = dir.trim().toLowerCase();

  if (lower.includes("north")) return "north";
  if (lower.includes("east")) return "east";
  if (lower.includes("south")) return "south";
  if (lower.includes("west")) return "west";

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

export interface NavigationInstructionsDropdownProps {
  instructions: NavigationInstruction[];
  onExit: () => void;
  /** When provided, the dropdown is controlled: this is the current step index. */
  selectedIndex?: number;
  /** Called when the user selects a different step (e.g. by tapping in the list). Use to sync selection with parent. */
  onSelectedIndexChange?: (index: number) => void;
}

export default function NavigationInstructionsDropdown({
  instructions,
  selectedIndex: controlledSelectedIndex,
  onSelectedIndexChange,
}: NavigationInstructionsDropdownProps) {
  const [expanded, setExpanded] = React.useState(false);
  const [internalSelectedIndex, setInternalSelectedIndex] = React.useState(0);

  const isControlled = controlledSelectedIndex !== undefined;
  const selectedIndex = isControlled ? controlledSelectedIndex : internalSelectedIndex;

  const handleSelectIndex = React.useCallback(
    (index: number) => {
      if (!isControlled) {
        setInternalSelectedIndex(index);
      }
      onSelectedIndexChange?.(index);
    },
    [isControlled, onSelectedIndexChange],
  );
  const animatedHeight = React.useRef(
    new Animated.Value(0),
  ).current;
  const animatedOpacity = React.useRef(new Animated.Value(0)).current;

  const runAnimation = React.useCallback(
    (nextExpanded: boolean) => {
      const targetExpandedHeight = Math.min(
        instructions.length * ROW_HEIGHT,
        MAX_DROPDOWN_HEIGHT,
      );
      Animated.parallel([
        Animated.timing(animatedHeight, {
          toValue: nextExpanded ? targetExpandedHeight : 0,
          duration: 200,
          useNativeDriver: false,
        }),
        Animated.timing(animatedOpacity, {
          toValue: nextExpanded ? 1 : 0,
          duration: 200,
          useNativeDriver: false,
        }),
      ]).start();
    },
    [animatedHeight, animatedOpacity, instructions.length],
  );

  const toggleExpanded = React.useCallback(() => {
    const next = !expanded;
    setExpanded(next);
    runAnimation(next);
  }, [expanded, runAnimation]);

  const collapse = React.useCallback(() => {
    if (!expanded) return;
    setExpanded(false);
    runAnimation(false);
  }, [expanded, runAnimation]);

  if (!instructions || instructions.length === 0) {
    return null;
  }

  const safeSelectedIndex =
    selectedIndex >= 0 && selectedIndex < instructions.length
      ? selectedIndex
      : 0;

  const currentInstruction = instructions[safeSelectedIndex];
  const currentNextInstruction =
    safeSelectedIndex + 1 < instructions.length
      ? instructions[safeSelectedIndex + 1]
      : null;
  const currentRelativeTurn = getRelativeTurn(
    currentInstruction.direction,
    currentNextInstruction?.direction,
  );

  let headerIconName: React.ComponentProps<typeof Ionicons>["name"] =
    "arrow-up-outline";

  if (
    currentInstruction.direction === "arrive" ||
    currentNextInstruction?.direction === "arrive"
  ) {
    headerIconName = "flag-outline";
  } else if (currentRelativeTurn === "left") {
    headerIconName = "arrow-back-outline";
  } else if (currentRelativeTurn === "right") {
    headerIconName = "arrow-forward-outline";
  } else if (currentRelativeTurn === "around") {
    headerIconName = "refresh-outline";
  } else if (currentRelativeTurn === "straight") {
    headerIconName = "arrow-up-outline";
  }

  return React.createElement(
    View,
    { style: styles.container },
    React.createElement(
      Pressable,
      {
        style: styles.header,
        onPress: toggleExpanded,
        accessibilityRole: "button",
        accessibilityLabel: "Toggle navigation steps list",
      },
      React.createElement(
        View,
        { style: styles.primaryRow },
        React.createElement(Ionicons, {
          name: headerIconName,
          size: 40,
          color: colors.text,
          style: styles.primaryIcon,
        }),
        React.createElement(
          View,
          { style: styles.primaryTextContainer },
          React.createElement(
            Text,
            { style: styles.primaryLabel },
            `Step ${currentInstruction.step} of ${instructions.length}`,
          ),
          React.createElement(
            Text,
            { style: styles.primaryInstruction },
            formatInstruction(currentInstruction, currentNextInstruction),
          ),
        ),
      ),
    ),
    React.createElement(
      Animated.View,
      {
        style: [
          styles.animatedContainer,
          { height: animatedHeight, opacity: animatedOpacity },
        ],
      },
      React.createElement(
        ScrollView,
        {
          style: styles.list,
          contentContainerStyle: styles.listContent,
        },
        instructions.map((instruction, index) =>
          React.createElement(
            Pressable,
            {
              key: String(instruction.step),
              onPress: () => handleSelectIndex(index),
              style: [
                styles.listItemPressable,
                index === safeSelectedIndex && styles.listItemSelected,
              ],
              accessibilityRole: "button",
              accessibilityLabel: `Select step ${instruction.step}`,
            },
            React.createElement(NavigationInstructionItem, {
              instruction,
              nextInstruction:
                index + 1 < instructions.length
                  ? instructions[index + 1]
                  : null,
            }),
          ),
        ),
      ),
    ),
    expanded
      ? React.createElement(
          Pressable,
          {
            style: styles.handleArrowContainer,
            onPress: collapse,
            accessibilityRole: "button",
            accessibilityLabel: "Collapse navigation steps",
          },
          React.createElement(Ionicons, {
            name: "chevron-up-outline",
            size: 24,
            style: styles.handleArrow,
          }),
        )
      : React.createElement(
          View,
          { style: styles.handleBarContainer },
          React.createElement(View, { style: styles.handleBar }),
        ),
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.background,
    borderRadius: 12,
    margin: spacing.sm,
    padding: spacing.sm,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  primaryRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    flex: 1,
  },
  primaryIcon: {
    marginRight: spacing.sm,
    marginTop: spacing.xs,
  },
  primaryTextContainer: {
    flex: 1,
  },
  primaryLabel: {
    ...typography.label,
    color: colors.textSecondary,
    marginBottom: 2,
  },
  primaryInstruction: {
    ...typography.h3,
    fontSize: 22,
    color: colors.text,
  },
  primaryMeta: {
    ...typography.label,
    color: colors.textSecondary,
    marginTop: 2,
  },
  animatedContainer: {
    overflow: "hidden",
  },
  handleBarContainer: {
    marginTop: spacing.sm,
    alignItems: "center",
  },
  handleBar: {
    width: 36,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: colors.placeholder,
  },
  handleArrowContainer: {
    marginTop: spacing.sm,
    alignItems: "center",
    paddingVertical: spacing.xs,
  },
  handleArrow: {
    color: colors.textSecondary,
    fontSize: 24,
    transform: [{ scaleX: 2 }],
  },
  list: {
    marginTop: spacing.xs,
  },
  listContent: {
    paddingBottom: spacing.xs,
  },
  listItemPressable: {
    borderRadius: 8,
  },
  listItemSelected: {
    backgroundColor: colors.backgroundSecondary,
  },
});

