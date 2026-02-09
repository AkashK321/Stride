/**
 * Register screen - allows new users to create an account.
 *
 * This screen is accessible at "/register" for unauthenticated users.
 * Users can create a new account with username, password, and email.
 */

import * as React from "react";
import { View, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";
import { colors } from "../../theme/colors";

export default function Register() {
  const router = useRouter();

  return React.createElement(
    SafeAreaView,
    {
      style: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        padding: spacing.xl,
      },
      edges: ["top", "bottom"],
    },
    React.createElement(
      Text,
      {
        style: {
          ...typography.body,
          color: colors.textSecondary,
          textAlign: "center",
        },
      },
      "Register screen - Not Implemented"
    ),
  );
}
