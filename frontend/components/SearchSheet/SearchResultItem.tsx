import * as React from "react";
import { View, Text, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { resultItemStyles as styles } from "./styles";
import { colors } from "../../theme/colors";
import type { LandmarkResult } from "../../services/api";

export interface SearchResultItemProps {
  landmark: LandmarkResult;
  onPress: (landmark: LandmarkResult) => void;
}

export default function SearchResultItem({
  landmark,
  onPress,
}: SearchResultItemProps) {
  return React.createElement(
    Pressable,
    {
      onPress: () => onPress(landmark),
      accessibilityRole: "button" as const,
      accessibilityLabel: `${landmark.name}, Floor ${landmark.floor_number}`,
      accessibilityHint: "Double tap to navigate to this destination",
      style: ({ pressed }: { pressed: boolean }) => [
        styles.container,
        pressed && styles.pressed,
      ],
    },

    React.createElement(
      View,
      { style: styles.iconContainer },
      React.createElement(Ionicons, {
        name: "location-sharp",
        size: 16,
        color: colors.primary,
      }),
    ),

    React.createElement(
      View,
      { style: styles.textContainer },
      React.createElement(Text, { style: styles.name, numberOfLines: 1 }, landmark.name),
      React.createElement(
        Text,
        { style: styles.floor, numberOfLines: 1 },
        `Floor ${landmark.floor_number}`,
      ),
    ),
  );
}
