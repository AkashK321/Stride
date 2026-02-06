/** 
 * Radius scale for the app.
 * 
 * Defines all radius values used throughout the app for consistency.
 * Radii are organized by semantic meaning. (small, medium, large, etc.)
 * or by component usage. (button, text, background, etc.)
 * 
 * Uses radii by importing them from this file. 
 * Import as: import { radii } from "../theme/radius";
 */

export const radii = {
    small: 4,
    medium: 12,
    large: 16,
} as const;

export type RadiusKey = keyof typeof radii;