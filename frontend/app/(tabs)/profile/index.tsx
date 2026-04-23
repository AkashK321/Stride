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
import { getIdToken } from "../../../services/tokenStorage";
import { spacing } from "../../../theme/spacing";
import { typography } from "../../../theme/typography";
import { colors } from "../../../theme/colors";
import { useSettings } from "../../../contexts/SettingsContext";

export default function Profile() {
  const router = useRouter();
  const { logout, isDevBypass } = useAuth();
  const [isLoggingOut, setIsLoggingOut] = React.useState(false);

  // User Profile State
  const [username, setUsername] = React.useState("Loading...");
  const [email, setEmail] = React.useState("");

  // App settings state
  const { cameraMode, setCameraMode } = useSettings();

  React.useEffect(() => {
    const fetchUserData = async () => {
      // Handle the case where the app is bypassed and no tokens exist
      if (isDevBypass) {
        setUsername("Developer Bypass");
        setEmail("dev@stride.local");
        return;
      }

      try {
        const token = await getIdToken();
        if (token) {
          const parts = token.split(".");
          if (parts.length === 3) {
            // Decode the base64 JWT payload
            const payload = JSON.parse(atob(parts[1]));
            
            // Extract the user data (supporting standard JWT and AWS Cognito keys)
            const decodedUsername = payload["cognito:username"] || payload.preferred_username || payload.username || "User";
            const decodedEmail = payload.email || "No email provided";

            setUsername(decodedUsername);
            setEmail(decodedEmail);
          }
        } else {
          setUsername("Unknown User");
        }
      } catch (error) {
        console.error("Failed to parse ID token for user profile:", error);
        setUsername("Unknown User");
      }
    };

    fetchUserData();
  }, [isDevBypass]);

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
      console.log("Camera Mode Disabled: Global circuit breaker activated.");
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
        React.createElement(Text, { style: typography.h3 }, username),
        React.createElement(
          Text,
          { style: { ...typography.body, color: colors.textSecondary } },
          email
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