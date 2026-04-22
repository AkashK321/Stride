/**
 * Register Credentials screen - Step 2: Username and Password
 *
 * This screen collects username and password.
 * Users then proceed to the contact information screen.
 */

import * as React from "react";
import { View, Text, Alert, Pressable, Keyboard, TouchableWithoutFeedback, TextInput, ScrollView, KeyboardAvoidingView, Platform, Dimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Button from "../../components/Button";
import TextField from "../../components/TextField";
import Label from "../../components/Label";
import ValidationIndicator, { ValidationStatus } from "../../components/ValidationIndicator";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";
import { colors } from "../../theme/colors";
import { checkUsernameAvailability } from "../../services/api";

export default function RegisterCredentials() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    firstName: string;
    lastName: string;
  }>();

  const scrollViewRef = React.useRef<ScrollView>(null);
  const usernameRef = React.useRef<TextInput>(null);
  const passwordRef = React.useRef<TextInput>(null);
  const passwordConfirmRef = React.useRef<TextInput>(null);
  const usernameAvailabilityTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const usernameAvailabilityRequestIdRef = React.useRef(0);

  const [username, setUsername] = React.useState("");
  const [usernameError, setUsernameError] = React.useState("");
  const [usernameAvailabilityStatus, setUsernameAvailabilityStatus] =
    React.useState<ValidationStatus>("idle");
  const [password, setPassword] = React.useState("");
  const [passwordError, setPasswordError] = React.useState("");
  const [passwordConfirm, setPasswordConfirm] = React.useState("");
  const [passwordConfirmError, setPasswordConfirmError] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [showPasswordConfirm, setShowPasswordConfirm] = React.useState(false);
  const [keyboardHeight, setKeyboardHeight] = React.useState(0);
  const [focusedField, setFocusedField] = React.useState<"username" | "password" | "passwordConfirm" | null>(null);
  const [hasScrolled, setHasScrolled] = React.useState(false);

  // Password requirements checking
  const checkPasswordRequirements = (pwd: string) => {
    return {
      minLength: pwd.length >= 8,
      hasUpperCase: /[A-Z]/.test(pwd),
      hasLowerCase: /[a-z]/.test(pwd),
      hasNumber: /[0-9]/.test(pwd),
      hasSpecialChar: /[^A-Za-z0-9]/.test(pwd),
    };
  };

  const passwordRequirements = React.useMemo(() => checkPasswordRequirements(password), [password]);
  const passwordsMatch = passwordConfirm.length > 0 && password === passwordConfirm;
  
  // Check if password meets all requirements
  const isPasswordValid = React.useMemo(() => {
    return passwordRequirements.minLength &&
           passwordRequirements.hasUpperCase &&
           passwordRequirements.hasLowerCase &&
           passwordRequirements.hasNumber &&
           passwordRequirements.hasSpecialChar;
  }, [passwordRequirements]);
  
  // Check if username is valid (not empty, minimum 3 characters)
  const isUsernameValid = React.useMemo(() => {
    return username.trim().length >= 3;
  }, [username]);
  const trimmedUsername = React.useMemo(() => username.trim(), [username]);
  
  // Form is valid if all conditions are met
  const isFormValid = React.useMemo(() => {
    return isUsernameValid && isPasswordValid && passwordsMatch;
  }, [isUsernameValid, isPasswordValid, passwordsMatch]);
  const requiresUsernameAvailabilityCheck = React.useMemo(
    () => trimmedUsername.length >= 3,
    [trimmedUsername]
  );
  const isUsernameAvailabilityBlockingStatus = React.useMemo(
    () => usernameAvailabilityStatus !== "available",
    [usernameAvailabilityStatus]
  );
  const isUsernameAvailabilityBlocking = React.useMemo(
    () => isFormValid && requiresUsernameAvailabilityCheck && isUsernameAvailabilityBlockingStatus,
    [isFormValid, requiresUsernameAvailabilityCheck, isUsernameAvailabilityBlockingStatus]
  );

  // Listen to keyboard events to get keyboard height
  React.useEffect(() => {
    const showSubscription = Keyboard.addListener("keyboardDidShow", (e) => {
      setKeyboardHeight(e.endCoordinates.height);
    });
    const hideSubscription = Keyboard.addListener("keyboardDidHide", () => {
      setKeyboardHeight(0);
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  const handlePasswordChange = (text: string) => {
    setPassword(text);
    setFocusedField("password"); // Track that password field is being interacted with
    
    // Real-time validation
    if (text.length > 0) {
      const requirements = checkPasswordRequirements(text);
      const allMet = requirements.minLength &&
                     requirements.hasUpperCase &&
                     requirements.hasLowerCase &&
                     requirements.hasNumber &&
                     requirements.hasSpecialChar;
      
      if (!allMet) {
        setPasswordError("Password does not meet all requirements");
      } else {
        setPasswordError("");
      }
    } else {
      setPasswordError("");
    }
    
    // Update password confirm error if passwords don't match
    if (passwordConfirm.length > 0) {
      if (text !== passwordConfirm) {
        setPasswordConfirmError("Passwords do not match");
      } else {
        setPasswordConfirmError("");
      }
    }
  };

  const handlePasswordConfirmChange = (text: string) => {
    setPasswordConfirm(text);
    setFocusedField("passwordConfirm"); // Track that password confirm field is being interacted with
    
    // Real-time validation
    if (text.length > 0) {
      if (text !== password) {
        setPasswordConfirmError("Passwords do not match");
      } else {
        setPasswordConfirmError("");
      }
    } else {
      setPasswordConfirmError("");
    }
  };

  const handleUsernameChange = (text: string) => {
    setUsername(text);
    setFocusedField("username"); // Track that username field is being interacted with
    
    // Real-time validation
    if (text.length > 0 && text.trim().length < 3) {
      setUsernameError("Username must be at least 3 characters");
    } else {
      setUsernameError("");
    }
  };

  // Reset scroll tracking when keyboard hides or field changes
  React.useEffect(() => {
    if (keyboardHeight === 0) {
      setHasScrolled(false);
    }
  }, [keyboardHeight]);

  // Auto-scroll only if field would be behind keyboard
  React.useEffect(() => {
    // Reset scroll tracking when focused field changes
    setHasScrolled(false);
    
    if (keyboardHeight > 0 && focusedField && scrollViewRef.current) {
      const windowHeight = Dimensions.get("window").height;
      const availableHeight = windowHeight - keyboardHeight;
      
      let fieldRef: React.RefObject<TextInput | null> | null = null;
      if (focusedField === "username") fieldRef = usernameRef;
      else if (focusedField === "password") fieldRef = passwordRef;
      else if (focusedField === "passwordConfirm") fieldRef = passwordConfirmRef;
      
      if (fieldRef?.current) {
        // Wait for KeyboardAvoidingView to finish adjusting, then check if we need to scroll
        const timeoutId = setTimeout(() => {
          // Measure field position relative to window to see if it's behind keyboard
          fieldRef?.current?.measureInWindow((x, y, width, height) => {
            if (!scrollViewRef.current || hasScrolled) return;
            
            const fieldBottom = y + height + spacing.sm; // Field bottom + padding
            
            // Only scroll if field would still be behind keyboard after KeyboardAvoidingView adjustment
            if (fieldBottom > availableHeight) {
              // Mark that we've scrolled to prevent double scrolling
              setHasScrolled(true);
              
              // Scroll to end to bring field into view with padding
              scrollViewRef.current.scrollToEnd({ animated: true });
            }
          });
        }, 700); // Wait longer for KeyboardAvoidingView to complete its adjustment
        
        return () => clearTimeout(timeoutId);
      }
    }
  }, [keyboardHeight, focusedField]);

  React.useEffect(() => {
    if (usernameAvailabilityTimeoutRef.current) {
      clearTimeout(usernameAvailabilityTimeoutRef.current);
      usernameAvailabilityTimeoutRef.current = null;
    }

    if (trimmedUsername.length < 3) {
      setUsernameAvailabilityStatus("idle");
      return;
    }

    const requestId = usernameAvailabilityRequestIdRef.current + 1;
    usernameAvailabilityRequestIdRef.current = requestId;

    usernameAvailabilityTimeoutRef.current = setTimeout(async () => {
      setUsernameAvailabilityStatus("loading");
      const result = await checkUsernameAvailability(trimmedUsername);

      // Ignore stale responses from older checks.
      if (requestId !== usernameAvailabilityRequestIdRef.current) {
        return;
      }

      if (result.error) {
        setUsernameAvailabilityStatus("error");
        return;
      }

      setUsernameAvailabilityStatus(result.available ? "available" : "taken");
    }, 500);

    return () => {
      if (usernameAvailabilityTimeoutRef.current) {
        clearTimeout(usernameAvailabilityTimeoutRef.current);
        usernameAvailabilityTimeoutRef.current = null;
      }
    };
  }, [trimmedUsername]);

  const handleNext = () => {
    // Clear previous errors
    setUsernameError("");
    setPasswordError("");
    setPasswordConfirmError("");

    // Validate inputs
    let hasErrors = false;

    if (!username.trim()) {
      setUsernameError("Username is required");
      hasErrors = true;
    } else if (username.trim().length < 3) {
      setUsernameError("Username must be at least 3 characters");
      hasErrors = true;
    }

    if (!password.trim()) {
      setPasswordError("Password is required");
      hasErrors = true;
    }

    if (!passwordConfirm.trim()) {
      setPasswordConfirmError("Password confirmation is required");
      hasErrors = true;
    } else if (password !== passwordConfirm) {
      setPasswordConfirmError("Passwords do not match");
      hasErrors = true;
    }

    if (hasErrors) {
      return;
    }

    if (requiresUsernameAvailabilityCheck) {
      if (usernameAvailabilityStatus === "loading" || usernameAvailabilityStatus === "idle") {
        setUsernameError("Please wait while we verify username availability");
        return;
      }

      if (usernameAvailabilityStatus === "taken") {
        setUsernameError("This username is already taken");
        return;
      }

      if (usernameAvailabilityStatus === "error") {
        setUsernameError("Unable to verify username availability right now");
        return;
      }
    }

    // Validate that we have all required data from step 1
    if (!params.firstName || !params.lastName) {
      Alert.alert("Error", "Missing required information. Please start over.");
      router.replace("/register");
      return;
    }

    // Navigate to contact information screen with form data
    router.push({
      pathname: "/register-contact",
      params: {
        firstName: params.firstName,
        lastName: params.lastName,
        username: username.trim(),
        password: password.trim(),
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
          KeyboardAvoidingView,
          {
            style: {
              flex: 1,
            },
            behavior: Platform.OS === "ios" ? "padding" : "height",
            keyboardVerticalOffset: Platform.OS === "ios" ? 0 : 20,
          },
        React.createElement(
          ScrollView,
          {
            ref: scrollViewRef,
            contentContainerStyle: {
              flexGrow: 1,
              justifyContent: "flex-start",
              alignItems: "center",
              gap: spacing.sm,
              paddingTop: spacing.xl,
              padding: spacing.xl,
              paddingBottom: spacing.xl + spacing.sm, // Fixed bottom padding for spacing above keyboard
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
            accessibilityLabel: "Registration form step 2",
          },
          "Step 2 of 3: Username & Password"
        ),
        React.createElement(
          View,
          {
            style: {
              width: "100%",
              marginBottom: spacing.md,
            },
          },
          React.createElement(TextField, {
            ref: usernameRef,
            value: username,
            onChangeText: handleUsernameChange,
            error: usernameError,
            autoCapitalize: "none",
            autoComplete: "username",
            autoCorrect: false,
            spellCheck: false,
            returnKeyType: "next",
            onSubmitEditing: () => {
              setFocusedField("username");
              passwordRef.current?.focus();
            },
            placeholder: "Username",
            accessibilityLabel: "Username",
            accessibilityHint: "Enter your desired username. Press next to move to password field.",
            style: {
              width: "100%",
            },
            rightIcon:
              usernameAvailabilityStatus === "idle"
                ? undefined
                : React.createElement(ValidationIndicator, {
                    status: usernameAvailabilityStatus,
                    variant: "icon",
                    loadingText: "Checking username availability",
                    availableText: "Username is available",
                    takenText: "Username is already taken",
                    errorText: "Unable to verify username availability",
                  }),
          }),
          React.createElement(ValidationIndicator, {
            status: usernameAvailabilityStatus,
            loadingText: "Checking username availability...",
            availableText: "Username is available",
            takenText: "Username is already taken",
            errorText: "Unable to verify username availability right now",
          }),
        ),
        React.createElement(
          View,
          {
            style: {
              width: "100%",
              marginBottom: spacing.md,
            },
          },
          React.createElement(TextField, {
            ref: passwordRef,
            value: password,
            onChangeText: handlePasswordChange,
            error: passwordError,
            secureTextEntry: !showPassword,
            autoCapitalize: "none",
            autoComplete: "new-password",
            autoCorrect: false,
            spellCheck: false,
            returnKeyType: "next",
            onSubmitEditing: () => {
              setFocusedField("password");
              passwordConfirmRef.current?.focus();
            },
            placeholder: "Password",
            accessibilityLabel: "Password",
            accessibilityHint: "Enter your password. Press next to move to password confirmation field.",
            style: {
              width: "100%",
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
                accessible: false,
              }),
            ),
          }),
          password.length > 0 && React.createElement(
            View,
            {
              style: {
                marginTop: spacing.sm,
                paddingLeft: spacing.sm,
                gap: spacing.xs,
              },
            },
            React.createElement(
              Text,
              {
                style: {
                  ...typography.label,
                  fontSize: 12,
                  color: colors.textSecondary,
                  marginBottom: spacing.xs,
                },
              },
              "Password must contain:"
            ),
            React.createElement(
              View,
              {
                style: {
                  gap: spacing.xs,
                },
              },
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
                  name: passwordRequirements.minLength ? "checkmark-circle" : "ellipse-outline",
                  size: 16,
                  color: passwordRequirements.minLength ? colors.primary : colors.textSecondary,
                }),
                React.createElement(
                  Text,
                  {
                    style: {
                      ...typography.label,
                      fontSize: 12,
                      color: passwordRequirements.minLength ? colors.text : colors.textSecondary,
                    },
                  },
                  "At least 8 characters"
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
                  name: passwordRequirements.hasUpperCase ? "checkmark-circle" : "ellipse-outline",
                  size: 16,
                  color: passwordRequirements.hasUpperCase ? colors.primary : colors.textSecondary,
                }),
                React.createElement(
                  Text,
                  {
                    style: {
                      ...typography.label,
                      fontSize: 12,
                      color: passwordRequirements.hasUpperCase ? colors.text : colors.textSecondary,
                    },
                  },
                  "One uppercase letter"
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
                  name: passwordRequirements.hasLowerCase ? "checkmark-circle" : "ellipse-outline",
                  size: 16,
                  color: passwordRequirements.hasLowerCase ? colors.primary : colors.textSecondary,
                }),
                React.createElement(
                  Text,
                  {
                    style: {
                      ...typography.label,
                      fontSize: 12,
                      color: passwordRequirements.hasLowerCase ? colors.text : colors.textSecondary,
                    },
                  },
                  "One lowercase letter"
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
                  name: passwordRequirements.hasNumber ? "checkmark-circle" : "ellipse-outline",
                  size: 16,
                  color: passwordRequirements.hasNumber ? colors.primary : colors.textSecondary,
                }),
                React.createElement(
                  Text,
                  {
                    style: {
                      ...typography.label,
                      fontSize: 12,
                      color: passwordRequirements.hasNumber ? colors.text : colors.textSecondary,
                    },
                  },
                  "One number"
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
                  name: passwordRequirements.hasSpecialChar ? "checkmark-circle" : "ellipse-outline",
                  size: 16,
                  color: passwordRequirements.hasSpecialChar ? colors.primary : colors.textSecondary,
                }),
                React.createElement(
                  Text,
                  {
                    style: {
                      ...typography.label,
                      fontSize: 12,
                      color: passwordRequirements.hasSpecialChar ? colors.text : colors.textSecondary,
                    },
                  },
                  "One special character"
                ),
              ),
            ),
          ),
        ),
        React.createElement(
          View,
          {
            style: {
              width: "100%",
              marginBottom: spacing.md,
            },
          },
          React.createElement(TextField, {
            ref: passwordConfirmRef,
            value: passwordConfirm,
            onChangeText: handlePasswordConfirmChange,
            error: passwordConfirmError,
            secureTextEntry: !showPasswordConfirm,
            autoCapitalize: "none",
            autoComplete: "off",
            autoCorrect: false,
            spellCheck: false,
            returnKeyType: "done",
            onSubmitEditing: () => {
              setFocusedField("passwordConfirm");
              handleNext();
            },
            placeholder: "Confirm Password",
            accessibilityLabel: "Confirm Password",
            accessibilityHint: "Re-enter your password to confirm. Press done to continue.",
            style: {
              width: "100%",
            },
            rightIcon: React.createElement(
              Pressable,
              {
                onPress: () => setShowPasswordConfirm(!showPasswordConfirm),
                style: {
                  padding: spacing.xs,
                },
                accessibilityLabel: showPasswordConfirm ? "Hide password confirmation" : "Show password confirmation",
                accessibilityRole: "button",
                accessibilityHint: showPasswordConfirm ? "Tap to hide your password confirmation" : "Tap to show your password confirmation",
              },
              React.createElement(Ionicons, {
                name: showPasswordConfirm ? "eye-off-outline" : "eye-outline",
                size: 20,
                color: colors.textSecondary,
                accessible: false,
              }),
            ),
          }),
          passwordConfirm.length > 0 && React.createElement(
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
              passwordsMatch ? "Passwords match" : "Passwords do not match"
            ),
          ),
        ),
        React.createElement(Button, {
          onPress: handleNext,
          title: "Continue",
          disabled: isUsernameAvailabilityBlocking,
          style: {
            marginTop: spacing.xl,
          },
          accessibilityLabel: "Continue to contact information",
          accessibilityRole: "button",
          accessibilityHint: "Continue to the next step to enter your email address",
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
    )
  );
}

