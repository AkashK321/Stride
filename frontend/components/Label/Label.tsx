/**
 * Label component - reusable text label for various contexts.
 *
 * A standardized label component that provides consistent styling and behavior
 * across the app. Supports multiple variants (screen title, section header, 
 * form label, error message, caption) and allows color overrides for nested text.
 *
 * Uses React.createElement (non-JSX) to match the project's TypeScript configuration.
 *
 * @param children - Text content or React elements (supports nested Text for color overrides)
 * @param variant - Label variant (screenTitle, sectionHeader, formHeader, formLabel, error, caption, body)
 * @param color - Optional color override for the entire label
 * @param style - Optional custom styles (merged with defaults)
 * @param accessibilityLabel - Accessibility label for screen readers
 */
import * as React from "react";
import { Text, TextStyle, ViewStyle } from "react-native";
import { labelStyles, LabelVariant } from "./styles";

export interface LabelProps {
  children?: React.ReactNode;
  variant?: LabelVariant;
  color?: string;
  style?: TextStyle;
  accessibilityLabel?: string;
}

export default function Label({
  children,
  variant = "body",
  color,
  style,
  accessibilityLabel,
}: LabelProps) {
  const getVariantStyle = (): TextStyle => {
    switch (variant) {
      case "screenTitle":
        return labelStyles.screenTitle;
      case "sectionHeader":
        return labelStyles.sectionHeader;
      case "formHeader":
        return labelStyles.formHeader;
      case "formLabel":
        return labelStyles.formLabel;
      case "error":
        return labelStyles.error;
      case "caption":
        return labelStyles.caption;
      default:
        return labelStyles.body;
    }
  };

  return React.createElement(
    Text,
    {
      style: [
        getVariantStyle(),
        color && { color },
        style,
      ],
      accessibilityLabel,
      accessibilityRole: "text",
    },
    children,
  );
}