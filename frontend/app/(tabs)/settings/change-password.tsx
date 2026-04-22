import * as React from "react";
import {
  View,
  Text,
  Alert,
  Pressable,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import Button from "../../../components/Button";
import TextField from "../../../components/TextField";
import { useAuth } from "../../../contexts/AuthContext";
import { changePassword } from "../../../services/api";
import { colors } from "../../../theme/colors";
import { spacing } from "../../../theme/spacing";
import { typography } from "../../../theme/typography";
import { checkPasswordRequirements, isPasswordValid } from "../../../utils/passwordPolicy";

export default function ChangePasswordScreen() {
  const router = useRouter();
  const { logout } = useAuth();
  const [currentPassword, setCurrentPassword] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [currentPasswordError, setCurrentPasswordError] = React.useState("");
  const [newPasswordError, setNewPasswordError] = React.useState("");
  const [confirmPasswordError, setConfirmPasswordError] = React.useState("");
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = React.useState(false);
  const [showNewPassword, setShowNewPassword] = React.useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = React.useState(false);

  const requirements = React.useMemo(
    () => checkPasswordRequirements(newPassword),
    [newPassword]
  );
  const newPasswordMeetsRequirements = React.useMemo(
    () => isPasswordValid(requirements),
    [requirements]
  );
  const passwordsMatch = confirmPassword.length > 0 && newPassword === confirmPassword;

  const handleCurrentPasswordChange = (text: string) => {
    setCurrentPassword(text);

    if (text.trim().length === 0) {
      setCurrentPasswordError("Current password is required");
      return;
    }

    setCurrentPasswordError("");
  };

  const handleNewPasswordChange = (text: string) => {
    setNewPassword(text);

    const trimmedNewPassword = text.trim();
    const trimmedCurrentPassword = currentPassword.trim();

    if (trimmedNewPassword.length === 0) {
      setNewPasswordError("New password is required");
    } else {
      const nextRequirements = checkPasswordRequirements(trimmedNewPassword);
      if (!isPasswordValid(nextRequirements)) {
        setNewPasswordError("Password does not meet all requirements");
      } else if (trimmedNewPassword === trimmedCurrentPassword) {
        setNewPasswordError("New password must be different from current password");
      } else {
        setNewPasswordError("");
      }
    }

    if (confirmPassword.trim().length > 0) {
      if (trimmedNewPassword !== confirmPassword.trim()) {
        setConfirmPasswordError("Passwords do not match");
      } else {
        setConfirmPasswordError("");
      }
    }
  };

  const handleConfirmPasswordChange = (text: string) => {
    setConfirmPassword(text);

    if (text.trim().length === 0) {
      setConfirmPasswordError("Password confirmation is required");
      return;
    }

    if (text.trim() !== newPassword.trim()) {
      setConfirmPasswordError("Passwords do not match");
      return;
    }

    setConfirmPasswordError("");
  };

  const handleSubmit = async () => {
    setCurrentPasswordError("");
    setNewPasswordError("");
    setConfirmPasswordError("");

    let hasErrors = false;
    if (!currentPassword.trim()) {
      setCurrentPasswordError("Current password is required");
      hasErrors = true;
    }

    if (!newPassword.trim()) {
      setNewPasswordError("New password is required");
      hasErrors = true;
    } else if (!newPasswordMeetsRequirements) {
      setNewPasswordError("Password does not meet all requirements");
      hasErrors = true;
    } else if (newPassword === currentPassword) {
      setNewPasswordError("New password must be different from current password");
      hasErrors = true;
    }

    if (!confirmPassword.trim()) {
      setConfirmPasswordError("Password confirmation is required");
      hasErrors = true;
    } else if (!passwordsMatch) {
      setConfirmPasswordError("Passwords do not match");
      hasErrors = true;
    }

    if (hasErrors) {
      return;
    }

    try {
      setIsSubmitting(true);
      await changePassword({
        currentPassword: currentPassword.trim(),
        newPassword: newPassword.trim(),
        newPasswordConfirm: confirmPassword.trim(),
      });
      Alert.alert("Success", "Password changed successfully", [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to change password";

      if (message.toLowerCase().includes("session") || message.toLowerCase().includes("log in again")) {
        Alert.alert("Session expired", "Please log in again.");
        await logout();
        return;
      }

      Alert.alert("Change password failed", message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return React.createElement(
    SafeAreaView,
    {
      style: {
        flex: 1,
      },
      edges: ["top", "bottom"],
    },
    React.createElement(
      KeyboardAvoidingView,
      {
        style: {
          flex: 1,
        },
        behavior: Platform.OS === "ios" ? "padding" : "height",
      },
      React.createElement(
        ScrollView,
        {
          contentContainerStyle: {
            flexGrow: 1,
            padding: spacing.lg,
            gap: spacing.md,
          },
          keyboardShouldPersistTaps: "handled",
        },
        React.createElement(
          Text,
          {
            style: typography.h1,
            accessibilityRole: "header",
          },
          "Change Password",
        ),
        React.createElement(TextField, {
          value: currentPassword,
          onChangeText: handleCurrentPasswordChange,
          error: currentPasswordError,
          secureTextEntry: !showCurrentPassword,
          autoComplete: "password",
          autoCapitalize: "none",
          autoCorrect: false,
          spellCheck: false,
          placeholder: "Current Password",
          accessibilityLabel: "Current Password",
          rightIcon: React.createElement(
            Pressable,
            {
              onPress: () => setShowCurrentPassword((prev) => !prev),
              accessibilityLabel: showCurrentPassword
                ? "Hide current password"
                : "Show current password",
              accessibilityRole: "button",
              style: {
                padding: spacing.xs,
              },
            },
            React.createElement(Ionicons, {
              name: showCurrentPassword ? "eye-off-outline" : "eye-outline",
              size: 20,
              color: colors.textSecondary,
            }),
          ),
        }),
        React.createElement(TextField, {
          value: newPassword,
          onChangeText: handleNewPasswordChange,
          error: newPasswordError,
          secureTextEntry: !showNewPassword,
          autoComplete: "new-password",
          autoCapitalize: "none",
          autoCorrect: false,
          spellCheck: false,
          placeholder: "New Password",
          accessibilityLabel: "New Password",
          rightIcon: React.createElement(
            Pressable,
            {
              onPress: () => setShowNewPassword((prev) => !prev),
              accessibilityLabel: showNewPassword ? "Hide new password" : "Show new password",
              accessibilityRole: "button",
              style: {
                padding: spacing.xs,
              },
            },
            React.createElement(Ionicons, {
              name: showNewPassword ? "eye-off-outline" : "eye-outline",
              size: 20,
              color: colors.textSecondary,
            }),
          ),
        }),
        newPassword.length > 0 &&
          React.createElement(
            View,
            {
              style: {
                marginTop: spacing.sm,
                paddingLeft: spacing.sm,
                gap: spacing.xs,
                marginBottom: spacing.sm,
              },
            },
            React.createElement(
              Text,
              {
                style: {
                  ...typography.label,
                  color: colors.textSecondary,
                },
              },
              "Password must contain:"
            ),
            React.createElement(
              View,
              {
                style: {
                  flexDirection: "row",
                  alignItems: "center",
                  gap: spacing.xs,
                },
              },
              React.createElement(Ionicons, {
                name: requirements.minLength ? "checkmark-circle" : "ellipse-outline",
                size: 16,
                color: requirements.minLength ? colors.primary : colors.textSecondary,
              }),
              React.createElement(
                Text,
                {
                  style: {
                    ...typography.label,
                    fontSize: 12,
                    color: requirements.minLength ? colors.text : colors.textSecondary,
                  },
                },
                "At least 8 characters",
              ),
            ),
            React.createElement(
              View,
              {
                style: {
                  flexDirection: "row",
                  alignItems: "center",
                  gap: spacing.xs,
                },
              },
              React.createElement(Ionicons, {
                name: requirements.hasUpperCase ? "checkmark-circle" : "ellipse-outline",
                size: 16,
                color: requirements.hasUpperCase ? colors.primary : colors.textSecondary,
              }),
              React.createElement(
                Text,
                {
                  style: {
                    ...typography.label,
                    fontSize: 12,
                    color: requirements.hasUpperCase ? colors.text : colors.textSecondary,
                  },
                },
                "One uppercase letter",
              ),
            ),
            React.createElement(
              View,
              {
                style: {
                  flexDirection: "row",
                  alignItems: "center",
                  gap: spacing.xs,
                },
              },
              React.createElement(Ionicons, {
                name: requirements.hasLowerCase ? "checkmark-circle" : "ellipse-outline",
                size: 16,
                color: requirements.hasLowerCase ? colors.primary : colors.textSecondary,
              }),
              React.createElement(
                Text,
                {
                  style: {
                    ...typography.label,
                    fontSize: 12,
                    color: requirements.hasLowerCase ? colors.text : colors.textSecondary,
                  },
                },
                "One lowercase letter",
              ),
            ),
            React.createElement(
              View,
              {
                style: {
                  flexDirection: "row",
                  alignItems: "center",
                  gap: spacing.xs,
                },
              },
              React.createElement(Ionicons, {
                name: requirements.hasNumber ? "checkmark-circle" : "ellipse-outline",
                size: 16,
                color: requirements.hasNumber ? colors.primary : colors.textSecondary,
              }),
              React.createElement(
                Text,
                {
                  style: {
                    ...typography.label,
                    fontSize: 12,
                    color: requirements.hasNumber ? colors.text : colors.textSecondary,
                  },
                },
                "One number",
              ),
            ),
            React.createElement(
              View,
              {
                style: {
                  flexDirection: "row",
                  alignItems: "center",
                  gap: spacing.xs,
                },
              },
              React.createElement(Ionicons, {
                name: requirements.hasSpecialChar ? "checkmark-circle" : "ellipse-outline",
                size: 16,
                color: requirements.hasSpecialChar ? colors.primary : colors.textSecondary,
              }),
              React.createElement(
                Text,
                {
                  style: {
                    ...typography.label,
                    fontSize: 12,
                    color: requirements.hasSpecialChar ? colors.text : colors.textSecondary,
                  },
                },
                "One special character",
              ),
            ),
          ),
        React.createElement(TextField, {
          value: confirmPassword,
          onChangeText: handleConfirmPasswordChange,
          error: confirmPasswordError,
          secureTextEntry: !showConfirmPassword,
          autoComplete: "off",
          autoCapitalize: "none",
          autoCorrect: false,
          spellCheck: false,
          placeholder: "Confirm New Password",
          accessibilityLabel: "Confirm New Password",
          rightIcon: React.createElement(
            Pressable,
            {
              onPress: () => setShowConfirmPassword((prev) => !prev),
              accessibilityLabel: showConfirmPassword
                ? "Hide new password confirmation"
                : "Show new password confirmation",
              accessibilityRole: "button",
              style: {
                padding: spacing.xs,
              },
            },
            React.createElement(Ionicons, {
              name: showConfirmPassword ? "eye-off-outline" : "eye-outline",
              size: 20,
              color: colors.textSecondary,
            }),
          ),
        }),
        confirmPassword.length > 0 &&
          React.createElement(
            View,
            {
              style: {
                marginTop: spacing.sm,
                paddingLeft: spacing.sm,
                flexDirection: "row",
                alignItems: "center",
                gap: spacing.xs,
              },
            },
            React.createElement(Ionicons, {
              name: passwordsMatch ? "checkmark-circle" : "close-circle",
              size: 16,
              color: passwordsMatch ? colors.primary : colors.danger,
            }),
            React.createElement(
              Text,
              {
                style: {
                  ...typography.label,
                  fontSize: 12,
                  color: colors.text,
                },
              },
              passwordsMatch ? "Passwords match" : "Passwords do not match",
            ),
          ),
        React.createElement(Button, {
          onPress: handleSubmit,
          title: "Save Password",
          loading: isSubmitting,
          disabled: isSubmitting,
          style: {
            marginTop: spacing.lg,
          },
          accessibilityLabel: "Save Password",
          accessibilityRole: "button",
          accessibilityHint: "Submit password change request",
        }),
        React.createElement(Button, {
          onPress: () => router.back(),
          title: "Cancel",
          variant: "secondary",
          disabled: isSubmitting,
          accessibilityLabel: "Cancel",
          accessibilityRole: "button",
          accessibilityHint: "Return to settings without changing password",
        }),
      ),
    ),
  );
}
