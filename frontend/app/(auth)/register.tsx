/**
 * Register screen - Step 1: Name information
 *
 * This screen collects first name and last name.
 * Users then proceed to the credentials screen.
 */

import * as React from "react";
import { View, Text, Alert, Pressable, Keyboard, TouchableWithoutFeedback, TextInput, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import Button from "../../components/Button";
import TextField from "../../components/TextField";
import Label from "../../components/Label";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";
import { colors } from "../../theme/colors";

export default function Register() {
  const router = useRouter();
  const firstNameRef = React.useRef<TextInput>(null);
  const lastNameRef = React.useRef<TextInput>(null);

  const [firstName, setFirstName] = React.useState("");
  const [firstNameError, setFirstNameError] = React.useState("");
  const [lastName, setLastName] = React.useState("");
  const [lastNameError, setLastNameError] = React.useState("");

  const handleNext = () => {
    // Clear previous errors
    setFirstNameError("");
    setLastNameError("");

    // Validate inputs
    let hasErrors = false;

    if (!firstName.trim()) {
      setFirstNameError("First name is required");
      hasErrors = true;
    }

    if (!lastName.trim()) {
      setLastNameError("Last name is required");
      hasErrors = true;
    }

    if (hasErrors) {
      return;
    }

    // Navigate to credentials screen with form data
    router.push({
      pathname: "/register-credentials",
      params: {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
      },
    } as any);
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
            accessibilityLabel: "Registration form step 1",
          },
          "Step 1 of 3: Your Name"
        ),
        React.createElement(TextField, {
          ref: firstNameRef,
          value: firstName,
          onChangeText: setFirstName,
          error: firstNameError,
          autoCapitalize: "words",
          autoComplete: "name-given",
          autoCorrect: false,
          spellCheck: false,
          returnKeyType: "next",
          onSubmitEditing: () => {
            lastNameRef.current?.focus();
          },
          placeholder: "First Name",
          accessibilityLabel: "First Name",
          accessibilityHint: "Enter your first name. Press next to move to last name field.",
          style: {
            width: "100%",
            marginBottom: spacing.md,
          },
        }),
        React.createElement(TextField, {
          ref: lastNameRef,
          value: lastName,
          onChangeText: setLastName,
          error: lastNameError,
          autoCapitalize: "words",
          autoComplete: "name-family",
          autoCorrect: false,
          spellCheck: false,
          returnKeyType: "done",
          onSubmitEditing: handleNext,
          placeholder: "Last Name",
          accessibilityLabel: "Last Name",
          accessibilityHint: "Enter your last name. Press done to continue.",
          style: {
            width: "100%",
            marginBottom: spacing.md,
          },
        }),
        React.createElement(Button, {
          onPress: handleNext,
          title: "Continue",
          style: {
            marginTop: spacing.xl,
          },
          accessibilityLabel: "Continue to credentials",
          accessibilityRole: "button",
          accessibilityHint: "Continue to the next step to enter your email and password",
        }),
        React.createElement(Button, {
          onPress: () => router.back(),
          title: "Back to Sign In",
          variant: "secondary",
          style: {
            marginTop: spacing.md,
          },
          accessibilityLabel: "Back to Sign In",
          accessibilityRole: "button",
          accessibilityHint: "Navigate back to the sign in screen",
        })
      )
    )
  );
}
