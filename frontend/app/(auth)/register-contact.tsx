/**
 * Register Contact screen - Step 3: Email and Contact information
 *
 * This screen collects email and phone number to complete registration.
 * Users submit the registration from this screen and are automatically logged in.
 */

import * as React from "react";
import { View, Text, Alert, Pressable, Keyboard, TouchableWithoutFeedback, TextInput, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { parsePhoneNumber, AsYouType } from "libphonenumber-js";
import Button from "../../components/Button";
import TextField from "../../components/TextField";
import Label from "../../components/Label";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";
import { colors } from "../../theme/colors";
import { register, login } from "../../services/api";
import { useAuth } from "../../contexts/AuthContext";

function isUnconfirmedAccountError(message: string): boolean {
  const normalized = message.toLowerCase();
  return normalized.includes("not confirmed") || normalized.includes("not verified");
}

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
  const phoneNumberRef = React.useRef<TextInput>(null);

  const [email, setEmail] = React.useState("");
  const [emailError, setEmailError] = React.useState("");
  const [phoneNumber, setPhoneNumber] = React.useState("");
  const [phoneNumberError, setPhoneNumberError] = React.useState("");
  const [contactMode, setContactMode] = React.useState<"phone" | "email">("phone");
  const [isLoading, setIsLoading] = React.useState(false);

  const handleEmailChange = (text: string) => {
    setEmail(text);
    setEmailError("");
  };

  const handleContactModeToggle = () => {
    setContactMode((current) => (current === "phone" ? "email" : "phone"));
    setEmailError("");
    setPhoneNumberError("");
  };

  // Format phone number as user types (defaults to US format)
  const handlePhoneNumberChange = (text: string) => {
    // Extract only digits and + sign (for country codes)
    // This allows natural deletion without formatting interference
    // By always extracting digits first, deletion works naturally because:
    // 1. User types/deletes -> TextInput gives us the new text
    // 2. We extract digits from that text
    // 3. We format those digits
    // This way, deletion of any character (digit or formatting) works correctly
    const digitsOnly = text.replace(/[^\d+]/g, "");
    
    // Use AsYouType formatter for natural formatting
    // It will automatically format as user types: (812) 294-9840
    // Pass only the digits to the formatter so it can format correctly
    const formatter = new AsYouType("US"); // Default to US, but will auto-detect country code if + is present
    const formatted = formatter.input(digitsOnly);
    
    setPhoneNumber(formatted);
    setPhoneNumberError(""); // Clear error when user starts typing
  };

  // Convert phone number to E.164 format for API
  const formatPhoneToE164 = (phone: string): string | null => {
    if (!phone.trim()) {
      return null;
    }

    try {
      // Try to parse the phone number
      const phoneNumber = parsePhoneNumber(phone, "US"); // Default to US if no country code
      
      if (phoneNumber && phoneNumber.isValid()) {
        return phoneNumber.number; // Returns E.164 format (e.g., +18122949840)
      }
      
      // If parsing fails, try to add US country code if it's a 10-digit number
      const digitsOnly = phone.replace(/\D/g, "");
      if (digitsOnly.length === 10) {
        return `+1${digitsOnly}`;
      }
      
      // If it starts with +, try to parse it
      if (phone.startsWith("+")) {
        const parsed = parsePhoneNumber(phone);
        if (parsed && parsed.isValid()) {
          return parsed.number;
        }
      }
      
      return null;
    } catch (error) {
      console.error("Phone number parsing error:", error);
      return null;
    }
  };

  const handleRegister = async () => {
    // Clear previous errors
    setEmailError("");
    setPhoneNumberError("");

    // Validate inputs
    let hasErrors = false;

    const trimmedEmail = email.trim();
    const hasEmail = trimmedEmail.length > 0;
    const hasPhoneInput = phoneNumber.trim().length > 0;
    const e164Phone = hasPhoneInput ? formatPhoneToE164(phoneNumber) : null;

    if (contactMode === "email" && !hasEmail) {
      setEmailError("Email is required");
      hasErrors = true;
    } else if (hasEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setEmailError("Please enter a valid email address");
      hasErrors = true;
    }

    if (contactMode === "phone" && !hasPhoneInput) {
      setPhoneNumberError("Phone number is required");
      hasErrors = true;
    } else if (hasPhoneInput && !e164Phone) {
      setPhoneNumberError("Please enter a valid phone number");
      hasErrors = true;
    }

    if (hasErrors) {
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
      const e164Phone = phoneNumber.trim() ? formatPhoneToE164(phoneNumber) : null;
      const registrationPayload = {
        username: params.username,
        password: params.password,
        passwordConfirm: params.password,
        firstName: params.firstName,
        lastName: params.lastName,
        ...(trimmedEmail ? { email: trimmedEmail } : {}),
        ...(e164Phone ? { phoneNumber: e164Phone } : {}),
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
        const loginErrorMessage =
          loginError instanceof Error ? loginError.message : "Login failed after registration";

        if (isUnconfirmedAccountError(loginErrorMessage)) {
          router.replace(`/verify?username=${encodeURIComponent(params.username)}`);
          return;
        }

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
      if (errorLower.includes("username") || errorLower.includes("already exists")) {
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
      } else if (errorLower.includes("phone") || errorLower.includes("already exists")) {
        setPhoneNumberError("An account with this phone number already exists");
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
            accessibilityLabel: "Registration form step 2",
          },
          "Step 3 of 3: Contact"
        ),
        contactMode === "email"
          ? React.createElement(TextField, {
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
                marginBottom: spacing.xs,
              },
            })
          : React.createElement(TextField, {
              ref: phoneNumberRef,
              value: phoneNumber,
              onChangeText: handlePhoneNumberChange,
              error: phoneNumberError,
              autoComplete: "tel",
              keyboardType: "phone-pad",
              returnKeyType: "done",
              onSubmitEditing: handleRegister,
              placeholder: "Phone Number",
              accessibilityLabel: "Phone Number",
              accessibilityHint: "Enter your phone number (e.g., (812) 294-9840). It will be automatically formatted.",
              style: {
                width: "100%",
                marginBottom: spacing.xs,
              },
            }),
        React.createElement(
          Pressable,
          {
            onPress: handleContactModeToggle,
            accessibilityRole: "button",
            accessibilityLabel: contactMode === "phone" ? "Use email instead" : "Use phone instead",
            style: {
              alignSelf: "flex-start",
              marginBottom: spacing.sm,
              marginLeft: spacing.xs,
            },
          },
          React.createElement(
            Text,
            {
              style: {
                ...typography.label,
                color: colors.primary,
              },
            },
            contactMode === "phone" ? "Use email instead" : "Use phone instead"
          )
        ),
        React.createElement(Button, {
          onPress: handleRegister,
          title: "Create Account",
          loading: isLoading,
          disabled: isLoading,
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

