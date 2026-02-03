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
import { TextInput, Text, View, ViewStyle, TextStyle } from "react-native";
import { textFieldStyles } from "./styles";
import { colors } from "../../theme/colors";

interface TextFieldProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  label?: string;
  error?: string;
  disabled?: boolean;
  secureTextEntry?: boolean;
  keyboardType?: "default" | "email-address" | "numeric" | "phone-pad" | "number-pad";
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  accessibilityLabel?: string;
  accessibilityHint?: string;
  style?: ViewStyle;
  inputStyle?: TextStyle;
}

export default function TextField({
  value,
  onChangeText,
  placeholder,
  label,
  error,
  disabled = false,
  secureTextEntry = false,
  keyboardType = "default",
  autoCapitalize = "none",
  accessibilityLabel,
  accessibilityHint,
  style,
  inputStyle,
}: TextFieldProps) {
  const [isFocused, setIsFocused] = React.useState(false);
  const inputRef = React.useRef<TextInput>(null);

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

    React.createElement(
      TextInput,
      {
        ref: inputRef,
        value,
        onChangeText,
        placeholder,
        placeholderTextColor: colors.placeholder,
        editable: !disabled,
        secureTextEntry,
        keyboardType,
        autoCapitalize,
        onFocus: handleFocus,
        onBlur: handleBlur,
        accessibilityLabel: accessibilityLabel || label || placeholder,
        accessibilityHint,
        accessibilityState: { disabled },
        style: [
          textFieldStyles.input,
          isFocused && textFieldStyles.inputFocused,
          error && textFieldStyles.inputError,
          disabled && textFieldStyles.inputDisabled,
          inputStyle,
        ],
      },
    ),
    // Error message
    error && React.createElement(
      Text,
      {
        style: textFieldStyles.errorText,
      },
      error,
    ),
  );
}