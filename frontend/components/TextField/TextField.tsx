/**
 * TextField component - reusable text input for forms.
 *
 * A standardized text input component that provides consistent styling and behavior
 * across the app. Features rounded corners, focus states, error handling, and
 * accessibility support.
 *
 * Uses React.createElement (non-JSX) to match the project's TypeScript configuration.
 *
 * @param value - Current value of the text input
 * @param onChangeText - Callback function called when text changes
 * @param placeholder - Placeholder text displayed when input is empty
 * @param label - Optional label text displayed above the input
 * @param required - Whether the field is required (shows asterisk)
 * @param error - Optional error message displayed below the input
 * @param disabled - Whether the input is disabled (prevents interaction)
 * @param secureTextEntry - Whether to hide text (for passwords)
 * @param keyboardType - Keyboard type (default, email-address, numeric, etc.)
 * @param autoCapitalize - Auto-capitalization setting (none, sentences, words, characters)
 * @param accessibilityLabel - Accessibility label for screen readers
 * @param accessibilityHint - Accessibility hint for screen readers
 * @param style - Optional custom styles for the container (merged with defaults)
 * @param inputStyle - Optional custom styles for the input (merged with defaults)
 */
import * as React from "react";
import { TextInput, Text, View, ViewStyle, TextStyle, Pressable } from "react-native";
import { textFieldStyles } from "./styles";
import { colors } from "../../theme/colors";

export interface TextFieldProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  label?: string;
  required?: boolean;
  error?: string;
  disabled?: boolean;
  secureTextEntry?: boolean;
  keyboardType?: "default" | "email-address" | "numeric" | "phone-pad" | "number-pad";
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  autoFocus?: boolean;
  returnKeyType?: "done" | "go" | "next" | "search" | "send";
  onSubmitEditing?: () => void;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  style?: ViewStyle;
  inputStyle?: TextStyle;
  rightIcon?: React.ReactNode;
}

const TextField = React.forwardRef<TextInput, TextFieldProps>(({
  value,
  onChangeText,
  placeholder,
  label,
  required = false,
  error,
  disabled = false,
  secureTextEntry = false,
  keyboardType = "default",
  autoCapitalize = "none",
  autoFocus = false,
  returnKeyType = "done",
  onSubmitEditing,
  accessibilityLabel,
  accessibilityHint,
  style,
  inputStyle,
  rightIcon,
}, ref) => {
  const [isFocused, setIsFocused] = React.useState(false);

  const handleFocus = () => {
    if (!disabled) {
      setIsFocused(true);
    }
  };

  const handleBlur = () => {
    setIsFocused(false);
  };

  return React.createElement(
    View,
    {
      style: [textFieldStyles.container, style],
    },
    // Label with optional required asterisk
    label && React.createElement(
      View,
      {
        style: textFieldStyles.labelContainer,
      },
      React.createElement(
        Text,
        {
          style: textFieldStyles.label,
        },
        label,
      ),
      required && React.createElement(
        Text,
        {
          style: textFieldStyles.requiredAsterisk,
        },
        "*",
      ),
    ),
    // Input container with optional right icon
    React.createElement(
      View,
      {
        style: {
          position: "relative",
        },
      },
      React.createElement(
        TextInput,
        {
          ref: ref,
          value,
          onChangeText,
          placeholder,
          placeholderTextColor: colors.placeholder,
          editable: !disabled,
          secureTextEntry,
          keyboardType,
          autoCapitalize,
          autoFocus,
          returnKeyType,
          onSubmitEditing,
          onFocus: handleFocus,
          onBlur: handleBlur,
          accessibilityLabel: accessibilityLabel || label || placeholder,
          accessibilityHint: error ? `${accessibilityHint || ""} Error: ${error}`.trim() : accessibilityHint,
          accessibilityState: { disabled },
          style: [
            textFieldStyles.input,
            isFocused && textFieldStyles.inputFocused,
            error && textFieldStyles.inputError,
            disabled && textFieldStyles.inputDisabled,
            rightIcon ? { paddingRight: 48 } : undefined, // Add padding for icon
            inputStyle,
          ].filter(Boolean) as TextStyle[],
        },
      ),
      rightIcon && React.createElement(
        View,
        {
          style: {
            position: "absolute",
            right: 12,
            top: 0,
            bottom: 0,
            justifyContent: "center",
            alignItems: "center",
          },
        },
        rightIcon,
      ),
    ),
    // Error message
    error && React.createElement(
      Text,
      {
        style: textFieldStyles.errorText,
        accessibilityRole: "alert",
        accessibilityLiveRegion: "polite",
        accessibilityLabel: `Error: ${error}`,
      },
      error,
    ),
  );
});

TextField.displayName = "TextField";

export default TextField;