import * as React from "react";
import { View, TextInput, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { searchInputStyles as styles } from "./styles";
import { colors } from "../../theme/colors";

export interface SearchInputProps {
  value: string;
  onChangeText: (text: string) => void;
  onFocus?: () => void;
}

export default function SearchInput({
  value,
  onChangeText,
  onFocus,
}: SearchInputProps) {
  return React.createElement(
    View,
    { style: styles.container },

    React.createElement(Ionicons, {
      name: "search",
      size: 18,
      color: colors.placeholder,
      style: styles.icon,
    }),

    React.createElement(TextInput, {
      value,
      onChangeText,
      onFocus,
      placeholder: "Search rooms, facilities\u2026",
      placeholderTextColor: colors.placeholder,
      returnKeyType: "search",
      autoCapitalize: "none",
      autoCorrect: false,
      accessibilityLabel: "Search destinations",
      accessibilityHint: "Type to search for rooms or facilities",
      style: styles.input,
    }),

    value.length > 0 &&
      React.createElement(
        Pressable,
        {
          onPress: () => onChangeText(""),
          hitSlop: 8,
          accessibilityRole: "button" as const,
          accessibilityLabel: "Clear search",
          style: styles.clearButton,
        },
        React.createElement(Ionicons, {
          name: "close-circle",
          size: 18,
          color: colors.placeholder,
        }),
      ),
  );
}
