/**
 * AuthGuard component - protects routes that require authentication.
 * 
 * This component can be used to wrap individual screens or route groups
 * that require authentication. It checks authentication status and
 * redirects to login if the user is not authenticated.
 * 
 * Usage: Wrap protected routes with <AuthGuard>...</AuthGuard>
 */

import * as React from "react";
import { View, ActivityIndicator } from "react-native";
import { useRouter, useSegments } from "expo-router";
import { useAuth } from "../contexts/AuthContext";
import { colors } from "../theme/colors";

interface AuthGuardProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export function AuthGuard({ children, fallback }: AuthGuardProps) {
  const { isAuthenticated, isDevBypass, isLoading } = useAuth();
  const router = useRouter();
  const segments = useSegments();

  React.useEffect(() => {
    if (isLoading) return; // Wait for auth check

    // Allow access in dev bypass mode
    if (isDevBypass) return;

    if (!isAuthenticated) {
      // User is not authenticated - redirect to login
      const inAuthGroup = segments[0] === "(auth)";
      if (!inAuthGroup) {
        router.replace("/");
      }
    }
  }, [isAuthenticated, isDevBypass, isLoading, segments, router]);

  // Show loading indicator while checking auth
  if (isLoading) {
    return fallback || React.createElement(
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

  // If not authenticated and not in dev bypass, don't render children (redirect will happen)
  if (!isAuthenticated && !isDevBypass) {
    return fallback || null;
  }

  // User is authenticated or in dev bypass mode - render children
  return React.createElement(React.Fragment, null, children);
}
