import * as React from "react";
import { View, Text } from "react-native";
import { useRouter } from "expo-router";
import Button from "../../components/Button";

export default function Landing() {
  const router = useRouter();

  return React.createElement(
    View,
    {
      style: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        gap: 16,
      },
    },
    React.createElement(Text, null, "Welcome to Stride."),
    React.createElement(Button, {
      onPress: () => router.replace("/home"),
      title: "Sign in",
    }),
  );
}

