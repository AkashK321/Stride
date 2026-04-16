/**
 * Register Contact screen - Step 3: Email information
 *
 * This screen collects email to complete registration.
 * Users submit the registration from this screen and are automatically logged in.
 */

import * as React from "react";
import { View, Text, Alert, Keyboard, TouchableWithoutFeedback, TextInput, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import Button from "../../components/Button";
import TextField from "../../components/TextField";
import Label from "../../components/Label";
import ValidationIndicator, { ValidationStatus } from "../../components/ValidationIndicator";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";
import { colors } from "../../theme/colors";
import { register, login, checkEmailAvailability } from "../../services/api";
import { useAuth } from "../../contexts/AuthContext";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function RegisterContact() {
  const router = useRouter();
  const { login: authLogin } = useAuth();
  const params = useLocalSearchParams<{
    firstName: string;
    lastName: string;
    username: string;
    password: string;
  }>();

  const emailRef = React.useRef<TextInput>(null);
  const emailAvailabilityTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const emailAvailabilityRequestIdRef = React.useRef(0);

  const [email, setEmail] = React.useState("");
  const [emailError, setEmailError] = React.useState("");
  const [emailAvailabilityStatus, setEmailAvailabilityStatus] =
    React.useState<ValidationStatus>("idle");
  const [isLoading, setIsLoading] = React.useState(false);
  const trimmedEmail = React.useMemo(() => email.trim(), [email]);
  const requiresEmailAvailabilityCheck = React.useMemo(
    () => Boolean(trimmedEmail) && EMAIL_REGEX.test(trimmedEmail),
    [trimmedEmail]
  );
  const isEmailAvailabilityBlocking = React.useMemo(
    () => requiresEmailAvailabilityCheck && emailAvailabilityStatus !== "available",
    [requiresEmailAvailabilityCheck, emailAvailabilityStatus]
  );

  const handleEmailChange = (text: string) => {
    setEmail(text);
    setEmailError("");
  };

  React.useEffect(() => {
    if (emailAvailabilityTimeoutRef.current) {
      clearTimeout(emailAvailabilityTimeoutRef.current);
      emailAvailabilityTimeoutRef.current = null;
    }

    if (!trimmedEmail || !EMAIL_REGEX.test(trimmedEmail)) {
      setEmailAvailabilityStatus("idle");
      return;
    }

    const requestId = emailAvailabilityRequestIdRef.current + 1;
    emailAvailabilityRequestIdRef.current = requestId;

    emailAvailabilityTimeoutRef.current = setTimeout(async () => {
      setEmailAvailabilityStatus("loading");
      const result = await checkEmailAvailability(trimmedEmail);

      if (requestId !== emailAvailabilityRequestIdRef.current) {
        return;
      }

      if (result.error) {
        setEmailAvailabilityStatus("error");
        return;
      }

      setEmailAvailabilityStatus(result.available ? "available" : "taken");
    }, 500);

    return () => {
      if (emailAvailabilityTimeoutRef.current) {
        clearTimeout(emailAvailabilityTimeoutRef.current);
        emailAvailabilityTimeoutRef.current = null;
      }
    };
  }, [trimmedEmail]);

  const handleRegister = async () => {
    // Clear previous errors
    setEmailError("");

    // Validate inputs
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setEmailError("Email is required");
      return;
    }

    if (!EMAIL_REGEX.test(trimmedEmail)) {
      setEmailError("Please enter a valid email address");
      return;
    }

    if (requiresEmailAvailabilityCheck && (emailAvailabilityStatus === "loading" || emailAvailabilityStatus === "idle")) {
      setEmailError("Please wait while we verify email availability");
      return;
    }

    if (requiresEmailAvailabilityCheck && emailAvailabilityStatus === "taken") {
      setEmailError("An account with this email already exists");
      return;
    }

    if (requiresEmailAvailabilityCheck && emailAvailabilityStatus === "error") {
      setEmailError("Unable to verify email availability right now");
      return;
    }

    // Validate that we have all required data from previous steps
    if (!params.firstName || !params.lastName || !params.username || !params.password) {
      Alert.alert("Error", "Missing required information. Please start over.");
      router.replace("/register");
      return;
    }

    setIsLoading(true);

    try {
      const trimmedEmail = email.trim();
      const registrationPayload = {
        username: params.username,
        password: params.password,
        passwordConfirm: params.password,
        firstName: params.firstName,
        lastName: params.lastName,
        email: trimmedEmail,
      };

      // Call register API with all provided data
      await register(registrationPayload);

      // Automatically log the user in after successful registration
      try {
        const loginResponse = await login({
          username: params.username,
          password: params.password,
        });

        // Store tokens and update auth state
        await authLogin({
          accessToken: loginResponse.accessToken,
          idToken: loginResponse.idToken,
          refreshToken: loginResponse.refreshToken,
        });

        // Navigate to home screen (AuthContext will handle the redirect)
        router.replace("/home");
      } catch (loginError) {
        // Registration succeeded but login failed - show message and redirect to login
        console.error("Auto-login failed after registration:", loginError);
        Alert.alert(
          "Registration Successful",
          "Your account has been created successfully. Please sign in to continue.",
          [
            {
              text: "OK",
              onPress: () => router.replace("/"),
            },
          ]
        );
      }
    } catch (error) {
      // Handle error
      const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred";

      // Show error alert
      Alert.alert("Registration Failed", errorMessage);

      // Set field errors if applicable
      const errorLower = errorMessage.toLowerCase();
      if (errorLower.includes("username")) {
        // Username conflict - need to go back to step 2
        Alert.alert(
          "Username Taken",
          "This username is already taken. Please choose a different username.",
          [
            {
              text: "OK",
              onPress: () => router.back(),
            },
          ]
        );
      } else if (errorLower.includes("email") || errorLower.includes("already exists")) {
        setEmailError("An account with this email already exists");
      } else if (errorLower.includes("password")) {
        // Password issue - need to go back to step 2
        Alert.alert(
          "Password Error",
          "Password does not meet requirements. Please choose a different password.",
          [
            {
              text: "OK",
              onPress: () => router.back(),
            },
          ]
        );
      }
    } finally {
      setIsLoading(false);
    }
  };

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
        },        React.createElement(
          Text,
          {
            style: {
              ...typography.h1,
              fontSize: 40,
              marginBottom: spacing.sm,
            },
            accessibilityRole: "header",
            accessibilityLabel: "Create your Stride account",
          },
          "Create your ",
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
            accessibilityLabel: "Registration form step 3",
          },
          "Step 3 of 3: Email"
        ),
        React.createElement(
          View,
          {
            style: {
              width: "100%",
            },
          },
          React.createElement(
            TextField,
            {
              ref: emailRef,
              value: email,
              onChangeText: handleEmailChange,
              error: emailError,
              autoCapitalize: "none",
              autoComplete: "email",
              keyboardType: "email-address",
              returnKeyType: "done",
              onSubmitEditing: handleRegister,
              placeholder: "Email",
              accessibilityLabel: "Email",
              accessibilityHint: "Enter your email address.",
              style: {
                width: "100%",
              },
              rightIcon:
                emailAvailabilityStatus === "idle"
                  ? undefined
                  : React.createElement(ValidationIndicator, {
                      status: emailAvailabilityStatus,
                      variant: "icon",
                      loadingText: "Checking email availability",
                      availableText: "Email is available",
                      takenText: "Email is already in use",
                      errorText: "Unable to verify email availability",
                    }),
            },
          ),
          React.createElement(ValidationIndicator, {
            status: emailAvailabilityStatus,
            loadingText: "Checking email availability...",
            availableText: "Email is available",
            takenText: "Email is already in use",
            errorText: "Unable to verify email availability right now",
          }),
        ),
        React.createElement(Button, {
          onPress: handleRegister,
          title: "Create Account",
          loading: isLoading,
          disabled: isLoading || isEmailAvailabilityBlocking,
          style: {
            marginTop: spacing.xl,
          },
          accessibilityLabel: "Create account",
          accessibilityRole: "button",
          accessibilityHint: isLoading ? "Creating account, please wait" : "Submit the registration form to create your account",
        }),
        React.createElement(Button, {
          onPress: () => router.back(),
          title: "Back",
          variant: "secondary",
          style: {
            marginTop: spacing.md,
          },
          accessibilityLabel: "Back to previous step",
          accessibilityRole: "button",
          accessibilityHint: "Go back to the previous step to edit your information",
        })
      )
    )
  );
}

