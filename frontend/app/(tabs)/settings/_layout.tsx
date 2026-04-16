import * as React from "react";
import { Stack } from "expo-router";

export default function SettingsLayout() {
  return React.createElement(Stack, {
    screenOptions: {
      headerShown: false,
    },
  });
}
