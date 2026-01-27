import * as React from "react";
import { View, Text } from "react-native";

export default function Settings() {
  return React.createElement(
    View,
    {
      style: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
      },
    },
    React.createElement(Text, null, "Settings"),
  );
}

