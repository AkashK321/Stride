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
    label: {
        ...typography.label,
        color: colors.text,
    },
    labelContainer: {
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.xs,
    },
    requiredAsterisk: {
        ...typography.label,
        color: colors.danger,
    },
    input: {
        ...typography.input,
        paddingVertical: spacing.md,
        paddingHorizontal: spacing.md,
        borderRadius: radii.medium,
        borderWidth: 2,
        borderColor: "transparent",
        backgroundColor: colors.background,
        color: colors.text,
        shadowColor: colors.text,
        shadowOpacity: 0.1,
        shadowRadius: 10,
        elevation: 2,
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