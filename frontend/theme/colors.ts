/**
 * Color palette for the app.
 * 
 * Defines all colors used throughout the app for consistency.
 * Colors are organized by semantic meaning. (primary, secondary, background, text, etc.)
 * or by component usage. (button, text, background, etc.)
 * 
 * Uses colors by importing them from this file. 
 * Import as: import { colors } from "../theme/colors";
 */

export const colors = {
    primary: "#48A062",
    primaryDark: "#1d4027",

    secondary: "#6B7280",
    secondaryDark: "#4B5563",

    // Danger/urgent (red) button colors
    danger: "#EF4444", // Red
    dangerDark: "#710a0a", // Darker red for pressed state

    buttonPrimaryText: "#ffffff",
    buttonPrimaryTextDisabled: "#ffffff80",
    
    // Text colors
    text: "#000000",
    textSecondary: "#6B7280",
    placeholder: "#9CA3AF",
    
    // Background colors
    background: "#FFFFFF",
    backgroundSecondary: "#F3F4F6",
} as const;

export type ColorKey = keyof typeof colors;