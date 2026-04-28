/**
 * Authentication context for managing user authentication state.
 * 
 * Provides authentication state, login, logout, and token refresh functionality
 * throughout the app. Checks for stored tokens on app startup and manages
 * automatic token refresh.
 */

import * as React from "react";
import { useRouter, useSegments } from "expo-router";
import {
  getBiometricLoginEnabled,
  getTokens,
  clearTokens,
  storeTokens,
  isTokenExpiringSoon,
} from "../services/tokenStorage";
import { refreshToken as refreshTokenApi } from "../services/api";
import { canUseBiometrics, promptBiometricUnlock } from "../services/biometricAuth";

interface AuthContextType {
  isAuthenticated: boolean;
  isDevBypass: boolean;
  isLoading: boolean;
  login: (tokens: { accessToken: string; idToken: string; refreshToken: string }) => Promise<void>;
  logout: () => Promise<void>;
  refreshTokens: () => Promise<boolean>;
  devBypass: () => void;
}

const AuthContext = React.createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = React.useState(false);
  const [isDevBypass, setIsDevBypass] = React.useState(false);
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

    // Dev bypass mode - allow access to tabs without authentication
    if (isDevBypass) {
      if (inAuthGroup) {
        router.replace("/home");
      }
      return;
    }

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
  }, [isAuthenticated, isDevBypass, isLoading, segments, router]);

  const checkAuthStatus = async () => {
    try {
      const tokens = await getTokens();
      if (!tokens) {
        setIsAuthenticated(false);
        return;
      }

      const tokenNeedsRefresh = await isTokenExpiringSoon();
      if (!tokenNeedsRefresh) {
        setIsAuthenticated(true);
        return;
      }

      const biometricEnabled = await getBiometricLoginEnabled();
      if (biometricEnabled) {
        const biometricAvailability = await canUseBiometrics();
        if (!biometricAvailability.available) {
          setIsAuthenticated(false);
          return;
        }

        const biometricResult = await promptBiometricUnlock("Unlock Stride");
        if (!biometricResult.success) {
          setIsAuthenticated(false);
          return;
        }
      }

      const refreshSucceeded = await tryRefresh(tokens.refreshToken, { clearOnFailure: true });
      if (!refreshSucceeded) {
        setIsAuthenticated(false);
        return;
      }

      setIsAuthenticated(true);
    } catch (error) {
      console.error("Error checking auth status:", error);
      setIsAuthenticated(false);
    } finally {
      setIsLoading(false);
    }
  };

  const shouldTreatRefreshAsEndpointUnavailable = (errorMessage: string): boolean => {
    return errorMessage.includes("not implemented") || 
      errorMessage.includes("404") || 
      errorMessage.includes("403") ||
      errorMessage.includes("Network request failed") ||
      errorMessage.includes("Missing Authentication Token");
  };

  const tryRefresh = async (
    refreshToken: string,
    options: { clearOnFailure: boolean }
  ): Promise<boolean> => {
    try {
      const refreshedTokens = await refreshTokenApi(refreshToken);
      await storeTokens({
        accessToken: refreshedTokens.accessToken,
        idToken: refreshedTokens.idToken,
        refreshToken: refreshedTokens.refreshToken,
      });
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";

      if (shouldTreatRefreshAsEndpointUnavailable(errorMessage)) {
        console.warn("Refresh endpoint not available, using existing tokens");
        return false;
      }

      if (options.clearOnFailure) {
        await clearTokens();
        setIsAuthenticated(false);
      }
      return false;
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
      setIsDevBypass(false);
      router.replace("/");
    } catch (error) {
      console.error("Error during logout:", error);
      throw error;
    }
  };

  const devBypass = () => {
    setIsDevBypass(true);
  };

  const refreshTokens = async (): Promise<boolean> => {
    try {
      const tokens = await getTokens();
      if (!tokens) {
        setIsAuthenticated(false);
        return false;
      }

      const refreshed = await tryRefresh(tokens.refreshToken, { clearOnFailure: true });
      if (refreshed) {
        setIsAuthenticated(true);
      } else {
        setIsAuthenticated(false);
      }
      return refreshed;
    } catch (error) {
      console.error("Error refreshing tokens:", error);
      await clearTokens();
      setIsAuthenticated(false);
      return false;
    }
  };

  const value: AuthContextType = {
    isAuthenticated,
    isDevBypass,
    isLoading,
    login,
    logout,
    refreshTokens,
    devBypass,
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
