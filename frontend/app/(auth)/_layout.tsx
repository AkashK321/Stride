/**
 * Authentication layout for unauthenticated user flows.
 *
 * Wraps all routes in the (auth) route group in their own Stack navigator.
 * This allows authentication-related screens (landing, login, forgot password, reset password)
 * to have distinct navigation behavior and styling separate from the main authenticated app.
 *
 * Route group (auth) doesn't appear in URLs - routes here map to paths like "/", "/login", etc.
 */
import * as React from "react";
import { Stack } from "expo-router";

export default function AuthLayout() {
  return React.createElement(Stack, {
    screenOptions: {
      headerShown: false,
      gestureEnabled: true, // Enable swipe-back gesture
      fullScreenGestureEnabled: true, // Enable full-screen swipe gesture on iOS
      gestureDirection: "horizontal", // Horizontal swipe direction
      animation: "slide_from_right", // Slide animation for navigation
    },
  });
}

