import * as React from "react";
import { Pressable, Text, ViewStyle, TextStyle } from "react-native";

interface ButtonProps {
  onPress: () => void;
  title: string;
  style?: ViewStyle;
  textStyle?: TextStyle;
}

export default function Button({ onPress, title, style, textStyle }: ButtonProps) {
  return React.createElement(
    Pressable,
    {
      onPress,
      style: [
        {
          paddingHorizontal: 24,
          paddingVertical: 12,
          borderRadius: 999,
          backgroundColor: "#2563EB",
        },
        style,
      ],
    },
    React.createElement(
      Text,
      {
        style: [
          {
            color: "white",
            fontWeight: "600",
          },
          textStyle,
        ],
      },
      title,
    ),
  );
}

