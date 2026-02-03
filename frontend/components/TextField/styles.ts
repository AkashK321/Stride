/**
 * Shared text field styles and style constants.
 *
 * This file defines all styles for the TextField component including
 * container, input, label, and error states.
 */
import { StyleSheet, TextStyle, ViewStyle } from "react-native";
import { colors } from "../../theme/colors";
import { radii } from "../../theme/radius";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";

export const textFieldStyles = StyleSheet.create({
    container: {
        alignSelf: "stretch",
        gap: spacing.xs,
    },
    input: {
        ...typography.input,
        paddingVertical: spacing.md,
        paddingHorizontal: spacing.lg,
        borderRadius: radii.medium,
        borderColor: colors.secondary,
        backgroundColor: colors.background,
        color: colors.text,
        shadowColor: colors.text,
        shadowOpacity: 0.05,
        shadowRadius: 10,
    },
    inputFocused: {
        borderColor: colors.primary,
        borderWidth: 2,
    },
    inputError: {
        borderColor: colors.danger,
    },
    inputDisabled: {
        backgroundColor: colors.backgroundSecondary,
        opacity: 0.6,
    },
    errorText: {
        ...typography.label,
        color: colors.danger,
        fontSize: 12,
    },
});