import * as React from "react";
import { View, Text } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import Button from "../../../components/Button";
import { useAuth } from "../../../contexts/AuthContext";
import { spacing } from "../../../theme/spacing";
import { typography } from "../../../theme/typography";

export default function SettingsScreen() {
  const router = useRouter();
  const { logout } = useAuth();
  const [isLoggingOut, setIsLoggingOut] = React.useState(false);

  const handleLogout = async () => {
    try {
      setIsLoggingOut(true);
      await logout();
    } catch (error) {
      console.error("Error during logout:", error);
      setIsLoggingOut(false);
    }
  };

  return React.createElement(
    SafeAreaView,
    {
      style: {
        flex: 1,
        padding: spacing.lg,
      },
      edges: ["top", "bottom"],
    },
    React.createElement(
      View,
      {
        style: {
          flex: 1,
          gap: spacing.lg,
        },
      },
      React.createElement(
        Text,
        {
          style: {
            ...typography.h1,
            marginBottom: spacing.md,
          },
        },
        "Settings",
      ),
      React.createElement(Button, {
        onPress: () => router.push("/settings/change-password"),
        title: "Change Password",
        accessibilityLabel: "Change Password",
        accessibilityRole: "button",
        accessibilityHint: "Go to the change password screen",
      }),
      React.createElement(
        View,
        {
          style: {
            marginTop: "auto",
          },
        },
        React.createElement(Button, {
          onPress: handleLogout,
          title: "Logout",
          variant: "danger",
          loading: isLoggingOut,
          disabled: isLoggingOut,
          style: {
            marginTop: spacing.xl,
          },
          accessibilityLabel: "Logout",
          accessibilityRole: "button",
          accessibilityHint: "Sign out of your account",
        }),
      ),
    ),
  );
}
