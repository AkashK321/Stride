/**
 * Shared label styles and style constants.
 *
 * This file defines all styles for the Label component including
 * variants for screen titles, section headers, form labels, error messages, etc.
 */
import { StyleSheet } from "react-native";
import { colors } from "../../theme/colors";
import { typography } from "../../theme/typography";

export type LabelVariant = "screenTitle" | "sectionHeader" | "formHeader" | "formLabel" | "error" | "caption" | "body";

export const labelStyles = StyleSheet.create({
    // Screen title - large heading (40px)
    screenTitle: {
        ...typography.h1,
        fontSize: 40,
        color: colors.text,
    },
    
    // Section header - medium heading
    sectionHeader: {
        ...typography.h1,
        color: colors.text,
    },
    
    // Form header - less bold, smaller than section header, larger than body
    formHeader: {
        ...typography.medium,
        color: colors.text,
    },
    
    // Form label - for form fields
    formLabel: {
        ...typography.label,
        color: colors.text,
    },
    
    // Error message - red text
    error: {
        ...typography.label,
        color: colors.danger,
    },
    
    // Caption/helper text - smaller secondary text
    caption: {
        ...typography.label,
        color: colors.textSecondary,
    },
    
    // Body text - standard body text
    body: {
        ...typography.body,
        color: colors.text,
    },
});