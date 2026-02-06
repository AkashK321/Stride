/**
 * Main tabs layout for authenticated app experience.
 *
 * Defines the bottom tab navigator that appears after users sign in.
 * Each Tabs.Screen corresponds to a route file in this directory and appears as a tab
 * in the bottom navigation bar.
 *
 * Route group (tabs) doesn't appear in URLs - routes here map to paths like "/home", "/profile", etc.
 */
import * as React from "react";
import { Tabs } from "expo-router";

export default function TabsLayout() {
  return React.createElement(
    Tabs,
    {
      screenOptions: {
        headerShown: false,
      },
    },
    // User profile tab - user's personal profile and information
    React.createElement(Tabs.Screen, { name: "profile" }),
    // Home feed / dashboard tab - main content feed
    React.createElement(Tabs.Screen, { name: "home" }),
    // App settings and preferences tab - app configuration and preferences
    React.createElement(Tabs.Screen, { name: "settings" }),
    // UI components tab - used to display all UI components and their usage
    React.createElement(Tabs.Screen, { name: "ui_components" }),
  );
}

