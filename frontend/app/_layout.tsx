/**
 * Root app layout for expo-router.
 *
 * This is the top-level layout that wraps the entire application in a Stack navigator.
 * All routes (including route groups like (auth) and (tabs)) are rendered within this Stack,
 * providing a single navigation tree for the entire app.
 *
 * This layout is required by expo-router and serves as the entry point for all navigation.
 */
import * as React from "react";
import { View, ActivityIndicator } from "react-native";
import { Stack } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useFonts, Roboto_400Regular, Roboto_700Bold, Roboto_300Light } from "@expo-google-fonts/roboto";
import { AuthProvider, useAuth } from "../contexts/AuthContext";
import { setupAutoRefresh } from "../services/tokenStorage";
import { colors } from "../theme/colors";

/**
 * Inner component that has access to AuthContext
 */
function AppContent() {
  const { isLoading } = useAuth();

  // Setup automatic token refresh
  React.useEffect(() => {
    const cleanup = setupAutoRefresh(5); // Check every 5 minutes
    return cleanup;
  }, []);

  // Show loading screen while checking authentication
  if (isLoading) {
    return React.createElement(
      View,
      {
        style: {
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: colors.background,
        },
      },
      React.createElement(ActivityIndicator, {
        size: "large",
        color: colors.primary,
      }),
    );
  }

  return React.createElement(Stack, {
    screenOptions: {
      headerShown: false,
      gestureEnabled: true, // Enable swipe gestures in root stack
      fullScreenGestureEnabled: true, // Enable full-screen gestures on iOS
    },
  });
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Roboto_300Light,
    Roboto_400Regular,
    Roboto_700Bold,
  });

  if (!fontsLoaded) {
    return null;
  }
  
  return React.createElement(
    GestureHandlerRootView,
    {
      style: { flex: 1 },
    },
    React.createElement(
      SafeAreaProvider,
      null,
      React.createElement(
        AuthProvider,
        null,
        React.createElement(AppContent),
      ),
    ),
  );
}

/**
 * Navigation guard that prevents access to protected routes when not authenticated.
 * 
 * The AuthContext handles most route protection automatically, but this provides
 * an additional layer of security. The AuthProvider's useEffect hook will redirect
 * users appropriately based on their authentication state.
 */
