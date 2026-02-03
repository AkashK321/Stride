/**
 * Typography scale for the app.
 * 
 * Defines all typography values used throughout the app for consistency.
 * Typography is organized by semantic meaning. (headings, body, etc.)
 * or by component usage. (button, text, background, etc.)
 * 
 * Uses typography by importing them from this file. 
 * Import as: import { typography } from "../theme/typography";
 */

export const fontFamily = {
    light: "Roboto_300Light",
    regular: "Roboto_400Regular",
    bold: "Roboto_700Bold",
} as const;

export const typography = {
    h1: { 
        fontSize: 28, 
        fontWeight: "700" as const,
        fontFamily: fontFamily.bold,
    },
    body: { 
        fontSize: 16, 
        fontWeight: "400" as const,
        fontFamily: fontFamily.regular,
    },
    label: { 
        fontSize: 14, 
        fontWeight: "400" as const,
        fontFamily: fontFamily.regular,
    },
    button: { 
        fontSize: 16, 
        fontWeight: "400" as const,
        fontFamily: fontFamily.regular,
    },
    input: {
        fontSize: 16,
        fontWeight: "300" as const,
        fontFamily: fontFamily.light,
    },
  } as const;


export type TypographyKey = keyof typeof typography;
export type FontFamilyKey = keyof typeof fontFamily;