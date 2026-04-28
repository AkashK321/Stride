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
import { View, Text, Switch, ScrollView, Alert, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import Button from "../../../components/Button";
import { useAuth } from "../../../contexts/AuthContext";
import { canUseBiometrics, promptBiometricUnlock } from "../../../services/biometricAuth";
import {
  clearBiometricLoginPreference,
  getBiometricLoginEnabled,
  getIdToken,
  setBiometricLoginEnabled,
} from "../../../services/tokenStorage";
import { spacing } from "../../../theme/spacing";
import { fontFamily, typography } from "../../../theme/typography";
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
  const [isBiometricLoginEnabled, setIsBiometricLoginEnabled] = React.useState(false);
  const [isLoadingBiometricPreference, setIsLoadingBiometricPreference] = React.useState(true);
  const [isSavingBiometricPreference, setIsSavingBiometricPreference] = React.useState(false);

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

  React.useEffect(() => {
    const loadBiometricPreference = async () => {
      try {
        const enabled = await getBiometricLoginEnabled();
        setIsBiometricLoginEnabled(enabled);
      } catch (error) {
        console.error("Failed to load biometric preference:", error);
      } finally {
        setIsLoadingBiometricPreference(false);
      }
    };

    void loadBiometricPreference();
  }, []);

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
      console.log("Camera Mode Disabled: Global circuit breaker activated.", { cameraMode: value });
    }
  };

  const handleBiometricToggle = async (nextValue: boolean) => {
    if (isSavingBiometricPreference || isLoadingBiometricPreference) {
      return;
    }

    try {
      setIsSavingBiometricPreference(true);

      if (!nextValue) {
        await clearBiometricLoginPreference();
        setIsBiometricLoginEnabled(false);
        return;
      }

      const availability = await canUseBiometrics();
      if (!availability.available) {
        if (availability.status === "not-supported") {
          Alert.alert(
            "Biometrics unavailable",
            "This device does not support biometric authentication."
          );
        } else if (availability.status === "not-enrolled") {
          Alert.alert(
            "Biometrics not set up",
            "Set up Face ID or fingerprint in your device settings and try again."
          );
        } else {
          Alert.alert(
            "Biometrics unavailable",
            "We could not verify biometric availability right now. Please try again."
          );
        }
        return;
      }

      const promptResult = await promptBiometricUnlock("Confirm biometric login setup");
      if (!promptResult.success) {
        if (promptResult.status === "cancelled") {
          Alert.alert("Setup cancelled", "Biometric login was not enabled.");
        } else if (promptResult.status === "lockout") {
          Alert.alert(
            "Biometrics temporarily locked",
            "Too many attempts were made. Unlock your device and try again."
          );
        } else {
          Alert.alert(
            "Verification failed",
            "Biometric verification did not succeed. Biometric login was not enabled."
          );
        }
        return;
      }

      await setBiometricLoginEnabled(true);
      setIsBiometricLoginEnabled(true);
    } catch (error) {
      console.error("Failed to update biometric login preference:", error);
      Alert.alert(
        "Unable to update setting",
        "We could not update your biometric login preference. Please try again."
      );
    } finally {
      setIsSavingBiometricPreference(false);
    }
  };

  return React.createElement(
    SafeAreaView,
    {
      style: { flex: 1, backgroundColor: "#FFFFFF" },
      edges: ["top"],
    },
    React.createElement(
      ScrollView,
      {
        contentContainerStyle: {
          flexGrow: 1, // Crucial: forces the ScrollView content to fill the screen
          padding: spacing.lg,
          paddingBottom: spacing.xl, // Extra padding at the very bottom
        },
      },

      // --- Top Content Group ---
      // Wraps everything except logout. flex: 1 pushes the next sibling down.
      React.createElement(
        View,
        { style: { flex: 1, gap: spacing.xl } }, // Increased gap to space out elements evenly
        
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
              borderWidth: 1,
              borderColor: colors.backgroundSecondary,
              borderRadius: 12,
              padding: spacing.md,
              gap: spacing.xs,
            },
          },
          React.createElement(
            View,
            {
              style: {
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                gap: spacing.md,
              },
            },
            React.createElement(
              View,
              { style: { flex: 1, gap: spacing.xs } },
              React.createElement(
                Text,
                {
                  style: {
                    ...typography.body,
                    fontFamily: fontFamily.bold,
                    fontWeight: "700",
                  },
                },
                "Camera Mode"
              ),
              React.createElement(
                Text,
                { style: { ...typography.body, color: colors.textSecondary } },
                "When enabled, collision detection and live navigation routing are active."
              )
            ),
            React.createElement(Switch, {
              value: cameraMode,
              onValueChange: handleCameraModeToggle,
              thumbColor: cameraMode ? colors.primary : undefined,
              trackColor: {
                false: colors.secondary,
                true: "#98caa8",
              },
              accessibilityLabel: "Camera Mode",
              accessibilityRole: "switch",
              accessibilityHint: "Enable or disable camera mode",
            })
          )
        ),
        React.createElement(
          View,
          {
            style: {
              borderWidth: 1,
              borderColor: colors.backgroundSecondary,
              borderRadius: 12,
              padding: spacing.md,
              gap: spacing.xs,
            },
          },
          React.createElement(
            View,
            {
              style: {
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                gap: spacing.md,
              },
            },
            React.createElement(
              View,
              {
                style: {
                  flex: 1,
                  gap: spacing.xs,
                },
              },
              React.createElement(
                Text,
                {
                  style: {
                    ...typography.body,
                    fontFamily: fontFamily.bold,
                    fontWeight: "700",
                  },
                },
                "Biometric Login"
              ),
              React.createElement(
                Text,
                {
                  style: {
                    ...typography.body,
                    color: colors.textSecondary,
                  },
                },
                "Use Face ID or fingerprint to unlock your account on app launch."
              )
            ),
            isLoadingBiometricPreference
              ? React.createElement(ActivityIndicator, {
                  size: "small",
                  color: colors.primary,
                })
              : React.createElement(Switch, {
                  value: isBiometricLoginEnabled,
                  onValueChange: handleBiometricToggle,
                  disabled: isSavingBiometricPreference,
                  thumbColor: isBiometricLoginEnabled ? colors.primary : undefined,
                  trackColor: {
                    false: colors.secondary,
                    true: "#98caa8",
                  },
                  accessibilityLabel: "Biometric Login",
                  accessibilityRole: "switch",
                  accessibilityHint: "Enable or disable biometric login unlock",
                })
          ),
          isSavingBiometricPreference &&
            React.createElement(
              Text,
              {
                style: {
                  ...typography.label,
                  color: colors.textSecondary,
                },
              },
              "Updating biometric preference..."
            )
        ),

        // --- Actions Section (Change Password) ---
        React.createElement(
          View,
          { style: { gap: spacing.xl } },
          React.createElement(
            View,
            {
              style: {
                borderWidth: 1,
                borderColor: colors.backgroundSecondary,
                borderRadius: 12,
                padding: spacing.md,
                gap: spacing.sm,
              },
            },
            React.createElement(
              Text,
              {
                style: {
                  ...typography.body,
                  fontFamily: fontFamily.bold,
                  fontWeight: "700",
                },
              },
              "Change Password"
            ),
            React.createElement(
              Text,
              {
                style: {
                  ...typography.body,
                  color: colors.textSecondary,
                },
              },
              "Update your account password to keep your login secure."
            ),
            React.createElement(Button, {
              onPress: () => router.push("/profile/change-password" as any),
              title: "Change Password",
              variant: "secondary",
              accessibilityLabel: "Change Password",
              accessibilityRole: "button",
              accessibilityHint: "Go to the change password screen",
              style: {
                marginTop: spacing.md,
              },
            })
          )
        )
      ), // End of Top Content Group

      // --- Bottom Content Group (Logout) ---
      // marginTop: 'auto' forces this element to stick to the bottom of the flex container
      React.createElement(
        View,
        { style: { marginTop: "auto", paddingTop: spacing.xl } },
        React.createElement(
          View,
          {
            style: {
              borderWidth: 1,
              borderColor: colors.backgroundSecondary,
              borderRadius: 12,
              padding: spacing.md,
              gap: spacing.sm,
            },
          },
          React.createElement(
            Text,
            {
              style: {
                ...typography.body,
                fontFamily: fontFamily.bold,
                fontWeight: "700",
              },
            },
            "Logout"
          ),
          React.createElement(
            Text,
            {
              style: {
                ...typography.body,
                color: colors.textSecondary,
              },
            },
            "Sign out of your account on this device."
          ),
          React.createElement(Button, {
            onPress: handleLogout,
            title: "Logout",
            variant: "danger",
            loading: isLoggingOut,
            disabled: isLoggingOut,
            accessibilityLabel: "Logout",
            accessibilityRole: "button",
            accessibilityHint: "Sign out of your account",
            style: {
              marginTop: spacing.md,
            },
          })
        )
      )
    )
  );
}