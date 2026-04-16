import * as React from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../../theme/colors";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";

export type ValidationStatus = "idle" | "loading" | "available" | "taken" | "error";

interface ValidationIndicatorProps {
  status: ValidationStatus;
  variant?: "icon" | "inline";
  loadingText: string;
  availableText: string;
  takenText: string;
  errorText: string;
  size?: number;
}

function getMessage(
  status: ValidationStatus,
  loadingText: string,
  availableText: string,
  takenText: string,
  errorText: string
): string {
  if (status === "loading") return loadingText;
  if (status === "available") return availableText;
  if (status === "taken") return takenText;
  if (status === "error") return errorText;
  return "";
}

export default function ValidationIndicator({
  status,
  variant = "inline",
  loadingText,
  availableText,
  takenText,
  errorText,
  size = 16,
}: ValidationIndicatorProps) {
  if (status === "idle") {
    return null;
  }

  const message = getMessage(status, loadingText, availableText, takenText, errorText);

  const icon =
    status === "loading"
      ? React.createElement(ActivityIndicator, {
          size: "small",
          color: colors.textSecondary,
          accessibilityElementsHidden: true,
          importantForAccessibility: "no-hide-descendants",
        })
      : React.createElement(Ionicons, {
          name: status === "available" ? "checkmark-circle" : "close-circle",
          size,
          color: status === "available" ? colors.primary : colors.danger,
          accessible: false,
        });

  if (variant === "icon") {
    return React.createElement(View, { accessible: false }, icon);
  }

  return React.createElement(
    View,
    {
      style: {
        marginTop: spacing.sm,
        paddingLeft: spacing.sm,
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.xs,
      },
      accessibilityLiveRegion: "polite",
      accessibilityLabel: message,
    },
    icon,
    React.createElement(
      Text,
      {
        style: {
          ...typography.label,
          fontSize: 12,
          color: status === "available" ? colors.primary : colors.textSecondary,
        },
      },
      message
    )
  );
}
