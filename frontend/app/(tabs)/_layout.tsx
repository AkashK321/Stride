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
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AuthGuard } from "../../components/AuthGuard";
import { colors } from "../../theme/colors";

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
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.textSecondary,
          tabBarStyle: {
            margin: 0,
            padding: 0,
            paddingBottom: insets.bottom,
            paddingTop: 0,
            height: 60 + insets.bottom,
          },
        },
      },
    // Home feed / dashboard tab - main content feed
    React.createElement(Tabs.Screen, {
      name: "home",
      options: {
        title: "Home",
        tabBarIcon: ({ color, size }) =>
          React.createElement(Ionicons, { name: "home", color, size }),
      },
    }),
    // App settings and preferences tab - app configuration and preferences
    React.createElement(Tabs.Screen, {
      name: "profile",
      options: {
        title: "Profile",
        tabBarIcon: ({ color, size }) =>
          React.createElement(Ionicons, { name: "person", color, size }),
      },
    }),
    // Navigation dev route - hidden from tab bar but still routable
    React.createElement(Tabs.Screen, {
      name: "nav-dev",
      options: {
        href: null,
      },
    }),
    // Sensor dev route - hidden from tab bar but still routable
    React.createElement(Tabs.Screen, {
      name: "sensor-dev",
      options: {
        href: null,
      },
    }),
    ),
  );
}

