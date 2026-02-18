/**
 * Landing screen - the first screen users see when opening the app.
 *
 * This is the root route ("/") for unauthenticated users. It displays a welcome message
 * and provides a "Sign in" button that navigates to the main tabbed app experience.
 *
 * Located in the (auth) route group, this screen serves as the entry point before users
 * authenticate. Future authentication flows (login, forgot password, etc.) will be added
 * alongside this screen in the (auth) directory.
 */
import * as React from "react";
import { View, Text, Alert, Pressable, Keyboard, TouchableWithoutFeedback, TextInput, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Button from "../../components/Button";
import TextField from "../../components/TextField";
import Label from "../../components/Label";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";
import { colors } from "../../theme/colors";
import { login } from "../../services/api";
import { useAuth } from "../../contexts/AuthContext";

export default function Landing() {
  const router = useRouter();
  const { login: authLogin, devBypass } = useAuth();
  const usernameRef = React.useRef<TextInput>(null);
  const passwordRef = React.useRef<TextInput>(null);
  const [username, setUsername] = React.useState("");
  const [usernameError, setUsernameError] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [passwordError, setPasswordError] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(false);
  const [showPassword, setShowPassword] = React.useState(false);

  const handleSignIn = async () => {
    // Clear previous errors
    setUsernameError("");
    setPasswordError("");

    // Validate inputs
    if (!username.trim()) {
      setUsernameError("Username is required");
      return;
    }

    if (!password.trim()) {
      setPasswordError("Password is required");
      return;
    }

    setIsLoading(true);

    try {
      // Call login API
      const response = await login({
        username: username.trim(),
        password: password.trim(),
      });

      // Store tokens and update auth state
      await authLogin({
        accessToken: response.accessToken,
        idToken: response.idToken,
        refreshToken: response.refreshToken,
      });

      // Navigation will be handled by AuthContext
    } catch (error) {
      // Handle error
      const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred";
      
      // Show error alert
      Alert.alert("Sign In Failed", errorMessage);
      
      // Set field errors if applicable
      if (errorMessage.toLowerCase().includes("user") || errorMessage.toLowerCase().includes("not found")) {
        setUsernameError("Invalid username or password");
      } else if (errorMessage.toLowerCase().includes("password")) {
        setPasswordError("Invalid password");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleDevBypass = () => {
    Alert.alert(
      "Developer Mode Active",
      "You are in developer bypass mode. There is no live backend endpoint configured.\n\n" +
        "To test with a live backend, you must:\n" +
        "1. Deploy the backend stack\n" +
        "2. Log in with valid credentials\n\n" +
        "Frontend-only features can be tested without a backend.",
      [
        {
          text: "OK",
          onPress: () => {
            devBypass();
          },
        },
      ]
    );
  };

  return React.createElement(
    TouchableWithoutFeedback,
    {
      onPress: Keyboard.dismiss,
      accessibilityLabel: "Dismiss keyboard",
      accessibilityRole: "button",
      accessible: false, // This is a container, not an interactive element
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
            accessibilityLabel: "Welcome back to Stride",
          },
          "Welcome back to ",
          React.createElement(
            Text,
            {
              style: {
                color: colors.primary,
              },
              accessible: false, // Nested text doesn't need separate accessibility
            },
            "Stride."
          )
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
            accessibilityLabel: "Sign in to your account",
          },
          "Sign in to your account"
        ),
        React.createElement(TextField, {
          ref: usernameRef,
          value: username,
          onChangeText: setUsername,
          error: usernameError,
          autoCapitalize: "none",
          autoComplete: "username",
          returnKeyType: "next",
          onSubmitEditing: () => {
            passwordRef.current?.focus();
          },
          placeholder: "Username",
          accessibilityLabel: "Username",
          accessibilityHint: "Enter your username. Press next to move to password field.",
          style: {
            width: "100%",
            marginBottom: spacing.md,
          },
        }),
        React.createElement(TextField, {
          ref: passwordRef,
          value: password,
          onChangeText: setPassword,
          error: passwordError,
          secureTextEntry: !showPassword,
          autoCapitalize: "none",
          autoComplete: "password",
          returnKeyType: "go",
          onSubmitEditing: handleSignIn,
          placeholder: "Password",
          accessibilityLabel: "Password",
          accessibilityHint: "Enter your password. Press go to sign in.",
          style: {
            width: "100%",
            marginBottom: spacing.md,
          },
          rightIcon: React.createElement(
            Pressable,
            {
              onPress: () => setShowPassword(!showPassword),
              style: {
                padding: spacing.xs,
              },
              accessibilityLabel: showPassword ? "Hide password" : "Show password",
              accessibilityRole: "button",
              accessibilityHint: showPassword ? "Tap to hide your password" : "Tap to show your password",
            },
            React.createElement(Ionicons, {
              name: showPassword ? "eye-off-outline" : "eye-outline",
              size: 20,
              color: colors.textSecondary,
              accessible: false, // Icon is decorative, accessibility handled by Pressable
            }),
          ),
        }),
        React.createElement(Button, {
          onPress: handleSignIn,
          title: "Sign in",
          loading: isLoading,
          disabled: isLoading,
          style: {
            marginTop: spacing.xl,
          },
          accessibilityLabel: "Sign in to your account",
          accessibilityRole: "button",
          accessibilityHint: isLoading ? "Signing in, please wait" : "Sign in to your account to continue",
        }),
        React.createElement(Button, {
          onPress: () => router.push("/register"),
          title: "Create an account",
          variant: "secondary",
          style: {
            marginTop: spacing.md,
          },
          accessibilityLabel: "Create an account",
          accessibilityRole: "button",
          accessibilityHint: "Navigate to the registration screen to create a new account",
        }),
        // Developer bypass button - only visible in development builds
        __DEV__ && React.createElement(
          View,
          {
            style: {
              marginTop: spacing.xl * 2,
              width: "100%",
              borderTopWidth: 1,
              borderTopColor: colors.placeholder,
              paddingTop: spacing.lg,
              alignItems: "center",
            },
          },
          React.createElement(
            Text,
            {
              style: {
                ...typography.body,
                color: colors.textSecondary,
                marginBottom: spacing.sm,
                fontSize: 12,
              },
            },
            "Development Only"
          ),
          React.createElement(Button, {
            onPress: handleDevBypass,
            title: "Developer Bypass",
            variant: "secondary",
            size: "small",
            style: {
              borderStyle: "dashed" as any,
              borderWidth: 1,
              borderColor: colors.secondary,
            },
            accessibilityLabel: "Developer bypass login",
            accessibilityRole: "button",
            accessibilityHint: "Skip authentication and enter the app in developer mode. No backend endpoints will be available.",
          }),
        ),
      )
    ),
  );
}

