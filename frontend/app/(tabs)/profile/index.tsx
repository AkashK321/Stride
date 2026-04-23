/**
 * Profile & Settings screen - user's personal profile and app configuration.
 *
 * This tab screen displays the authenticated user's profile information,
 * toggles application settings like camera mode, routes to password management,
 * and provides the ability to log out.
 *
 * Uses React.createElement (non-JSX) to match the project's TypeScript configuration.
 */
import * as React from "react";
import { View, Text, Switch, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import Button from "../../../components/Button";
import { useAuth } from "../../../contexts/AuthContext";
import { spacing } from "../../../theme/spacing";
import { typography } from "../../../theme/typography";
import { colors } from "../../../theme/colors";

export default function Profile() {
  const router = useRouter();
  const { logout } = useAuth();
  const [isLoggingOut, setIsLoggingOut] = React.useState(false);

  // App settings state
  const [cameraMode, setCameraMode] = React.useState(true);

  // Mock User Info (TODO: Fetch this from AuthContext or an API endpoint)
  const user = {
    username: "DemoUser",
    email: "demo@example.com",
  };

  const handleLogout = async () => {
    try {
      setIsLoggingOut(true);
      await logout();
    } catch (error) {
      console.error("Error during logout:", error);
      setIsLoggingOut(false);
    }
  };

  const handleCameraModeToggle = (value: boolean) => {
    setCameraMode(value);
    if (!value) {
      // TODO: Hook into your context/services to disable collision detection
      // and halt any ongoing live navigation requests
      console.log("Camera Mode Disabled: Disabling collision detection and live navigation.");
    } else {
      console.log("Camera Mode Enabled: Resuming features.");
    }
  };

  return React.createElement(
    SafeAreaView,
    {
      style: { flex: 1, backgroundColor: "#FFFFFF" },
      edges: ["top", "bottom"],
    },
    React.createElement(
      ScrollView,
      {
        contentContainerStyle: {
          padding: spacing.lg,
          gap: spacing.xl,
          paddingBottom: spacing.xl,
        },
      },

      // --- Header: User Information ---
      React.createElement(
        View,
        {
          style: {
            gap: spacing.xs,
            borderBottomWidth: 1,
            borderBottomColor: "#E5E5E5",
            paddingBottom: spacing.lg,
          },
        },
        React.createElement(
          Text,
          { style: { ...typography.h1, marginBottom: spacing.sm } },
          "Profile & Settings"
        ),
        React.createElement(Text, { style: typography.h3 }, user.username),
        React.createElement(
          Text,
          { style: { ...typography.body, color: colors.textSecondary } },
          user.email
        )
      ),

      // --- Settings: Camera Mode ---
      React.createElement(
        View,
        {
          style: {
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
          },
        },
        React.createElement(
          View,
          { style: { flex: 1, paddingRight: spacing.md, gap: spacing.xs } },
          React.createElement(Text, { style: typography.h3 }, "Camera Mode"),
          React.createElement(
            Text,
            { style: { ...typography.caption, color: colors.textSecondary } },
            "When enabled, collision detection and live navigation routing are active."
          )
        ),
        React.createElement(Switch, {
          value: cameraMode,
          onValueChange: handleCameraModeToggle,
          trackColor: { true: colors.primary },
        })
      ),

      // --- Actions Section ---
      React.createElement(
        View,
        { style: { gap: spacing.md, marginTop: spacing.md } },
        React.createElement(Button, {
          // Routes directly to the robust validation screen imported from main
          onPress: () => router.push("/profile/change-password" as any),
          title: "Change Password",
          variant: "secondary",
          accessibilityLabel: "Change Password",
          accessibilityRole: "button",
          accessibilityHint: "Go to the change password screen",
        }),
        React.createElement(Button, {
          onPress: handleLogout,
          title: "Logout",
          variant: "danger",
          loading: isLoggingOut,
          disabled: isLoggingOut,
          accessibilityLabel: "Logout",
          accessibilityRole: "button",
          accessibilityHint: "Sign out of your account",
        })
      )
    )
  );
}