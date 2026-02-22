/**
 * Main tabs layout for authenticated app experience.
 *
 * Defines the bottom tab navigator that appears after users sign in.
 * Each Tabs.Screen corresponds to a route file in this directory and appears as a tab
 * in the bottom navigation bar.
 *
 * Route group (tabs) doesn't appear in URLs - routes here map to paths like "/home", "/profile", etc.
 * 
 * All routes in this layout are protected and require authentication.
 */
import * as React from "react";
import { Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AuthGuard } from "../../components/AuthGuard";

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  
  return React.createElement(
    AuthGuard,
    null,
    React.createElement(
      Tabs,
      {
        screenOptions: {
          headerShown: false,
          tabBarStyle: {
            margin: 0,
            padding: 0,
            paddingBottom: insets.bottom,
            paddingTop: 0,
            height: 60 + insets.bottom,
          },
        },
      },
    // User profile tab - user's personal profile and information
    React.createElement(Tabs.Screen, { name: "profile" }),
    // Home feed / dashboard tab - main content feed
    React.createElement(Tabs.Screen, { name: "home" }),
    // App settings and preferences tab - app configuration and preferences
    React.createElement(Tabs.Screen, { name: "settings" }),
    // Navigation tab - camera frame capture and transmission
    React.createElement(Tabs.Screen, { name: "navigation" }),
    // UI components tab - used to display all UI components and their usage
    React.createElement(Tabs.Screen, { name: "ui_components" }),
    // Sensor dev tab - hidden from tab bar (dev only, accessible via direct navigation)
    React.createElement(Tabs.Screen, { name: "sensor-dev" }),
    ),
  );
}

