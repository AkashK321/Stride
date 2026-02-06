/**
 * Button component - reusable primary button for user actions.
 *
 * A standardized button component that provides consistent styling and behavior
 * across the app. Features a blue background, white text, and rounded corners by default,
 * with support for custom styling via props.
 *
 * Uses React.createElement (non-JSX) to match the project's TypeScript configuration.
 *
 * @param onPress - Callback function executed when the button is pressed
 * @param title - Text displayed inside the button
 * @param disabled - Whether the button is disabled (prevents interaction)
 * @param loading - Whether the button is loading (shows a loading indicator)
 * @param accessibilityLabel - Accessibility label for the button
 * @param accessibilityRole - Accessibility role for the button
 * @param accessibilityHint - Accessibility hint for the button
 * @param style - Optional custom styles for the button container (merged with defaults)
 * @param textStyle - Optional custom styles for the button text (merged with defaults)
 */
import * as React from "react";
import { Pressable, Text, ViewStyle, TextStyle, ActivityIndicator } from "react-native";
import { buttonStyles, ButtonVariant, ButtonSize } from "./styles";
import { colors } from "../../theme/colors";

export interface ButtonProps {
  onPress: () => void;
  title: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  accessibilityLabel?: string;
  accessibilityRole?: "button" | "link";
  accessibilityHint?: string;
  style?: ViewStyle;
  textStyle?: TextStyle;
}

export default function Button({
  onPress,
  title,
  variant = "primary",
  size = "medium",
  disabled = false, 
  loading = false,
  accessibilityLabel,
  accessibilityRole = "button",
  accessibilityHint,
  style,
  textStyle,
}: ButtonProps) {
  const [isPressed, setIsPressed] = React.useState(false);
  const isDisabled = disabled || loading;

  const handlePress = () => {
    if (!isDisabled) {
      onPress();
    }
  };

  // Get variant-specific styles
  const getVariantStyle = () => {
    switch (variant) {
      case "secondary":
        return buttonStyles.variantSecondary;
      case "danger":
        return buttonStyles.variantDanger;
      default:
        return buttonStyles.variantPrimary;
    }
  };

  const getVariantPressedStyle = () => {
    switch (variant) {
      case "secondary":
        return buttonStyles.variantSecondaryPressed;
      case "danger":
        return buttonStyles.variantDangerPressed;
      default:
        return buttonStyles.variantPrimaryPressed;
    }
  };

  // Get size-specific styles
  const getSizeStyle = () => {
    switch (size) {
      case "small":
        return buttonStyles.sizeSmall;
      case "medium":
        return buttonStyles.sizeMedium;
      case "large":
        return buttonStyles.sizeLarge;
    }
  };

  return React.createElement(
    Pressable,
    {
      onPress: handlePress,
      onPressIn: () => !isDisabled && setIsPressed(true),
      onPressOut: () => setIsPressed(false),
      disabled: isDisabled,
      accessibilityRole,
      accessibilityLabel: accessibilityLabel || title,
      accessibilityHint,
      accessibilityState: { disabled: isDisabled },
      style: [
        buttonStyles.container,
        getSizeStyle(),
        getVariantStyle(),
        isPressed && !isDisabled && getVariantPressedStyle(),
        isDisabled && buttonStyles.containerDisabled,
        style,
      ],
    },
    loading && React.createElement(ActivityIndicator, {
      color: colors.buttonPrimaryText,
      size: "small",
      style: { position: "absolute" },
    }),
    React.createElement(
      Text,
      {
        style: [
          buttonStyles.text,
          loading && buttonStyles.textLoading,
          isPressed && !isDisabled && buttonStyles.textPressed,
          textStyle,
        ],
      },
      title,
    ),
  );
}