/**
 * Shared button styles and style constants.
 *
 * This file can be used to export shared style objects, constants, or style utilities
 * that are used across different button variants or related components.
 *
 * Currently empty but ready for future style definitions (e.g., button variants,
 * size constants, theme-based styles).
 */
import { StyleSheet } from "react-native";
import { colors } from "../../theme/colors";
import { radii } from "../../theme/radius";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";

export type ButtonVariant = "primary" | "secondary" | "danger";
export type ButtonSize = "small" | "medium" | "large";


export const buttonStyles = StyleSheet.create({
    // Base container styles
    container: {
        borderRadius: radii.medium,
        alignItems: "center",
        justifyContent: "center",
        alignSelf: "stretch",
    },
    
    // Size variants
    sizeSmall: {
        paddingVertical: spacing.sm,
        paddingHorizontal: spacing.md,
    },
    sizeMedium: {
        paddingVertical: spacing.md,
        paddingHorizontal: spacing.lg,
    },
    sizeLarge: {
        paddingVertical: spacing.lg,
        paddingHorizontal: spacing.xl,
    },
    
    // Variant styles - Primary (default, green)
    variantPrimary: {
        backgroundColor: colors.primary,
    },
    variantPrimaryPressed: {
        backgroundColor: colors.primaryDark,
    },
    
    // Variant styles - Secondary (grey)
    variantSecondary: {
        backgroundColor: colors.secondary,
    },
    variantSecondaryPressed: {
        backgroundColor: colors.secondaryDark,
    },
    
    // Variant styles - Danger (red/urgent)
    variantDanger: {
        backgroundColor: colors.danger,
    },
    variantDangerPressed: {
        backgroundColor: colors.dangerDark,
    },
    
    // Disabled state
    containerDisabled: {
        opacity: 0.5,
    },
    
    // Text styles
    text: {
        color: colors.buttonPrimaryText,
        ...typography.button,
    },
    textPressed: {
        opacity: 0.8,
    },
    textLoading: {
        opacity: 0,
    },
});