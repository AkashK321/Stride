import * as React from "react";
import { View, Text, Alert, Switch, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import Button from "../../../components/Button";
import { useAuth } from "../../../contexts/AuthContext";
import { canUseBiometrics, promptBiometricUnlock } from "../../../services/biometricAuth";
import {
  clearBiometricLoginPreference,
  getBiometricLoginEnabled,
  setBiometricLoginEnabled,
} from "../../../services/tokenStorage";
import { colors } from "../../../theme/colors";
import { spacing } from "../../../theme/spacing";
import { fontFamily, typography } from "../../../theme/typography";

export default function SettingsScreen() {
  const router = useRouter();
  const { logout } = useAuth();
  const [isLoggingOut, setIsLoggingOut] = React.useState(false);
  const [isBiometricLoginEnabled, setIsBiometricLoginEnabled] = React.useState(false);
  const [isLoadingBiometricPreference, setIsLoadingBiometricPreference] = React.useState(true);
  const [isSavingBiometricPreference, setIsSavingBiometricPreference] = React.useState(false);

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
        onPress: () => router.push("/(tabs)/settings/change-password" as never),
        title: "Change Password",
        accessibilityLabel: "Change Password",
        accessibilityRole: "button",
        accessibilityHint: "Go to the change password screen",
      }),
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
              "Biometric Login",
            ),
            React.createElement(
              Text,
              {
                style: {
                  ...typography.body,
                  color: colors.textSecondary,
                },
              },
              "Use Face ID or fingerprint to unlock your account on app launch.",
            ),
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
              }),
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
            "Updating biometric preference...",
          ),
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
