/**
 * Landing screen - the first screen users see when opening the app.
 *
 * This is the root route ("/") for unauthenticated users. It displays a welcome message
 * and provides a "Sign in" button that navigates to the main tabbed app experience.
 *
 * Located in the (auth) route group, this screen serves as the entry point before users
 * authenticate. Future authentication flows (login, forgot password, etc.) will be added
 * alongside this screen in the (auth) directory.
 */
import * as React from "react";
import { View, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import Button from "../../components/Button";
import TextField from "../../components/TextField";
import { spacing } from "../../theme/spacing";

export default function Landing() {
  const router = useRouter();
  const [email, setEmail] = React.useState("");
  const [emailError, setEmailError] = React.useState("");

  return React.createElement(
    SafeAreaView,
    {
      style: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        gap: 16,
        padding: spacing.lg,
      },
      edges: ["top", "bottom"],
    },
    React.createElement(Text, null, "Welcome to Stride."),
    React.createElement(Button, {
      onPress: () => router.replace("/home"),
      title: "Sign in",
      accessibilityLabel: "Sign in to your account",
      accessibilityRole: "button",
      accessibilityHint: "Sign in to your account to continue",
    }),
    React.createElement(TextField, {
      value: email,
      onChangeText: setEmail,
      placeholder: "Email",
      label: "Email",
      keyboardType: "email-address",
      error: emailError,
    })
  );
}

