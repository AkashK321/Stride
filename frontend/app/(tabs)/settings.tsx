/**
 * Settings screen - app configuration and user preferences.
 *
 * This tab screen, accessible at "/settings", allows users to configure app settings,
 * manage preferences, and access account-related options like notifications, privacy, etc.
 *
 * Currently a placeholder screen that will be expanded with settings management features.
 * Uses React.createElement (non-JSX) to match the project's TypeScript configuration.
 */
import * as React from "react";
import { View, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Button from "../../components/Button";
import { useAuth } from "../../contexts/AuthContext";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";

export default function Settings() {
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

