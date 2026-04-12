import * as React from "react";
import {
  View,
  Text,
  Alert,
  Keyboard,
  TouchableWithoutFeedback,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import Button from "../../components/Button";
import TextField from "../../components/TextField";
import Label from "../../components/Label";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";
import { colors } from "../../theme/colors";
import { confirmSignUp, resendSignUpCode } from "../../services/api";

const RESEND_COOLDOWN_SECONDS = 30;

export default function VerifyScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ username?: string }>();

  const [username, setUsername] = React.useState(params.username?.toString() ?? "");
  const [usernameError, setUsernameError] = React.useState("");
  const [code, setCode] = React.useState("");
  const [codeError, setCodeError] = React.useState("");
  const [isVerifying, setIsVerifying] = React.useState(false);
  const [isResending, setIsResending] = React.useState(false);
  const [resendCooldown, setResendCooldown] = React.useState(0);
  const [statusMessage, setStatusMessage] = React.useState("");

  React.useEffect(() => {
    if (typeof params.username === "string" && params.username.trim().length > 0) {
      setUsername(params.username);
    }
  }, [params.username]);

  React.useEffect(() => {
    if (resendCooldown <= 0) {
      return;
    }

    const timeoutId = setTimeout(() => {
      setResendCooldown((previous) => Math.max(previous - 1, 0));
    }, 1000);

    return () => clearTimeout(timeoutId);
  }, [resendCooldown]);

  const clearErrors = () => {
    setUsernameError("");
    setCodeError("");
    setStatusMessage("");
  };

  const handleCodeChange = (text: string) => {
    const digitsOnly = text.replace(/\D/g, "").slice(0, 6);
    setCode(digitsOnly);
    setCodeError("");
    setStatusMessage("");
  };

  const handleVerify = async () => {
    clearErrors();
    const trimmedUsername = username.trim();
    const trimmedCode = code.trim();

    if (!trimmedUsername) {
      setUsernameError("Username is required");
      return;
    }

    if (!trimmedCode) {
      setCodeError("Verification code is required");
      return;
    }

    setIsVerifying(true);

    try {
      await confirmSignUp({
        username: trimmedUsername,
        code: trimmedCode,
      });

      Alert.alert("Account verified", "Your account is confirmed. Please sign in to continue.", [
        {
          text: "OK",
          onPress: () => router.replace("/"),
        },
      ]);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Verification failed";
      setStatusMessage(errorMessage);
    } finally {
      setIsVerifying(false);
    }
  };

  const handleResendCode = async () => {
    setUsernameError("");
    setCodeError("");
    setStatusMessage("");

    const trimmedUsername = username.trim();
    if (!trimmedUsername) {
      setUsernameError("Username is required");
      return;
    }

    if (resendCooldown > 0) {
      return;
    }

    setIsResending(true);

    try {
      const response = await resendSignUpCode({
        username: trimmedUsername,
      });
      setStatusMessage(response.message || "Verification code sent successfully");
      setResendCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unable to resend code";
      setStatusMessage(errorMessage);
    } finally {
      setIsResending(false);
    }
  };

  const resendLabel =
    resendCooldown > 0 ? `Resend code (${resendCooldown}s)` : "Resend verification code";

  return React.createElement(
    TouchableWithoutFeedback,
    {
      onPress: Keyboard.dismiss,
      accessibilityLabel: "Dismiss keyboard",
      accessibilityRole: "button",
      accessible: false,
    },
    React.createElement(
      SafeAreaView,
      {
        style: {
          flex: 1,
        },
        edges: ["top", "bottom"],
      },
      React.createElement(
        ScrollView,
        {
          contentContainerStyle: {
            flexGrow: 1,
            justifyContent: "flex-start",
            alignItems: "center",
            gap: spacing.sm,
            paddingTop: spacing.xl,
            padding: spacing.xl,
          },
          keyboardShouldPersistTaps: "handled",
          showsVerticalScrollIndicator: false,
        },
        React.createElement(
          Text,
          {
            style: {
              ...typography.h1,
              fontSize: 40,
              marginBottom: spacing.sm,
            },
            accessibilityRole: "header",
            accessibilityLabel: "Verify your Stride account",
          },
          "Verify your ",
          React.createElement(
            Text,
            {
              style: {
                color: colors.primary,
              },
              accessible: false,
            },
            "Stride"
          ),
          " account"
        ),
        React.createElement(
          Label,
          {
            variant: "formHeader",
            style: {
              paddingTop: spacing.lg,
              marginBottom: spacing.md,
              alignSelf: "flex-start",
              color: colors.textSecondary,
            },
            accessibilityLabel: "Enter your username and confirmation code",
          },
          "Enter your confirmation code"
        ),
        React.createElement(TextField, {
          value: username,
          onChangeText: (text: string) => {
            setUsername(text);
            setUsernameError("");
            setStatusMessage("");
          },
          error: usernameError,
          autoCapitalize: "none",
          autoComplete: "username",
          returnKeyType: "next",
          placeholder: "Username",
          accessibilityLabel: "Username",
          accessibilityHint: "Enter the username for the account you are verifying.",
          style: {
            width: "100%",
            marginBottom: spacing.md,
          },
        }),
        React.createElement(TextField, {
          value: code,
          onChangeText: handleCodeChange,
          error: codeError,
          keyboardType: "number-pad",
          returnKeyType: "done",
          onSubmitEditing: handleVerify,
          maxLength: 6,
          placeholder: "6-digit code",
          accessibilityLabel: "Verification code",
          accessibilityHint: "Enter the 6-digit verification code sent to you.",
          style: {
            width: "100%",
            marginBottom: spacing.md,
          },
        }),
        statusMessage
          ? React.createElement(
              View,
              {
                style: {
                  width: "100%",
                  marginBottom: spacing.md,
                },
              },
              React.createElement(
                Text,
                {
                  style: {
                    ...typography.body,
                    color: statusMessage.toLowerCase().includes("success")
                      ? colors.primary
                      : colors.textSecondary,
                  },
                },
                statusMessage
              )
            )
          : null,
        React.createElement(Button, {
          onPress: handleVerify,
          title: "Verify account",
          loading: isVerifying,
          disabled: isVerifying || isResending,
          style: {
            marginTop: spacing.md,
          },
          accessibilityLabel: "Verify account",
          accessibilityRole: "button",
          accessibilityHint: isVerifying
            ? "Verifying account, please wait"
            : "Submit your verification code to confirm your account",
        }),
        React.createElement(Button, {
          onPress: handleResendCode,
          title: resendLabel,
          loading: isResending,
          disabled: isResending || resendCooldown > 0 || isVerifying,
          variant: "secondary",
          style: {
            marginTop: spacing.md,
          },
          accessibilityLabel: "Resend verification code",
          accessibilityRole: "button",
          accessibilityHint:
            resendCooldown > 0
              ? `You can request another code in ${resendCooldown} seconds`
              : "Request a new confirmation code",
        }),
        React.createElement(Button, {
          onPress: () => router.replace("/"),
          title: "Back to sign in",
          variant: "secondary",
          style: {
            marginTop: spacing.md,
          },
          accessibilityLabel: "Back to sign in",
          accessibilityRole: "button",
          accessibilityHint: "Go back to the sign in screen",
        })
      )
    )
  );
}
