/**
 * Authentication context for managing user authentication state.
 * 
 * Provides authentication state, login, logout, and token refresh functionality
 * throughout the app. Checks for stored tokens on app startup and manages
 * automatic token refresh.
 */

import * as React from "react";
import { useRouter, useSegments } from "expo-router";
import { isAuthenticated as checkAuth, getTokens, clearTokens, storeTokens } from "../services/tokenStorage";
import { refreshToken as refreshTokenApi } from "../services/api";

interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (tokens: { accessToken: string; idToken: string; refreshToken: string }) => Promise<void>;
  logout: () => Promise<void>;
  refreshTokens: () => Promise<boolean>;
}

const AuthContext = React.createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(true);
  const router = useRouter();
  const segments = useSegments();

  // Check authentication status on mount
  React.useEffect(() => {
    checkAuthStatus();
  }, []);

  // Protect routes based on authentication
  React.useEffect(() => {
    if (isLoading) return; // Wait for auth check to complete

    const inAuthGroup = segments[0] === "(auth)";
    const inTabsGroup = segments[0] === "(tabs)";

    // If not authenticated, redirect to login (unless already in auth group)
    if (!isAuthenticated) {
      if (!inAuthGroup) {
        // User is trying to access protected route - redirect to login
        router.replace("/");
      }
      // If already in auth group, allow access (user is on login/register page)
      return;
    }

    // If authenticated, redirect away from auth pages to home
    if (isAuthenticated && inAuthGroup) {
      router.replace("/home");
      return;
    }

    // If authenticated and trying to access tabs, allow access
    if (isAuthenticated && inTabsGroup) {
      // User is authenticated and accessing protected routes - allow
      return;
    }
  }, [isAuthenticated, isLoading, segments, router]);

  const checkAuthStatus = async () => {
    try {
      const authenticated = await checkAuth();
      setIsAuthenticated(authenticated);
      
      // If authenticated, attempt to refresh tokens if they're expiring
      // If refresh endpoint is not available, we'll keep the existing tokens
      // and the user will need to log in again when they expire
      if (authenticated) {
        // Attempt refresh, but don't fail if endpoint doesn't exist
        const refreshed = await refreshTokens();
        if (!refreshed) {
          // Refresh failed or endpoint unavailable - keep existing auth state
          // User will be logged out when token actually expires
          console.log("Token refresh unavailable or failed, using existing tokens");
        }
      }
    } catch (error) {
      console.error("Error checking auth status:", error);
      setIsAuthenticated(false);
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (tokens: { accessToken: string; idToken: string; refreshToken: string }) => {
    try {
      await storeTokens(tokens);
      setIsAuthenticated(true);
    } catch (error) {
      console.error("Error during login:", error);
      throw error;
    }
  };

  const logout = async () => {
    try {
      await clearTokens();
      setIsAuthenticated(false);
      router.replace("/");
    } catch (error) {
      console.error("Error during logout:", error);
      throw error;
    }
  };

  const refreshTokens = async (): Promise<boolean> => {
    try {
      const tokens = await getTokens();
      if (!tokens) {
        setIsAuthenticated(false);
        return false;
      }

      // Attempt to refresh tokens
      // If endpoint doesn't exist (404), we'll catch and return false
      // without clearing tokens - user can continue using app until token expires
      const newTokens = await refreshTokenApi(tokens.refreshToken);
      
      // Store new tokens
      await storeTokens({
        accessToken: newTokens.accessToken,
        idToken: newTokens.idToken,
        refreshToken: newTokens.refreshToken,
      });

      setIsAuthenticated(true);
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      
      // If endpoint doesn't exist (404), don't clear tokens - allow user to continue
      if (errorMessage.includes("not implemented") || errorMessage.includes("404")) {
        console.warn("Refresh endpoint not available, using existing tokens");
        return false; // Return false but keep auth state
      }
      
      // For other errors (invalid token, expired, etc.), clear tokens
      console.error("Error refreshing tokens:", errorMessage);
      await clearTokens();
      setIsAuthenticated(false);
      return false;
    }
  };

  const value: AuthContextType = {
    isAuthenticated,
    isLoading,
    login,
    logout,
    refreshTokens,
  };

  return React.createElement(AuthContext.Provider, { value }, children);
}

export function useAuth() {
  const context = React.useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
