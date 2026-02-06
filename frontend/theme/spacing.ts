/**
 * Spacing scale for the app.
 * 
 * Defines all spacing values used throughout the app for consistency.
 * Spacing is organized by semantic meaning. (small, medium, large, etc.)
 * or by component usage. (button, text, background, etc.)
 * 
 * Uses spacing by importing them from this file. 
 * Import as: import { spacing } from "../theme/spacing";
 */

export const spacing = {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
  } as const;

  export type SpacingKey = keyof typeof spacing;
  