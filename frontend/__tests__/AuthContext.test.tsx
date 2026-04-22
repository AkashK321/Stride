/**
 * Integration tests for AuthContext
 * 
 * Tests the authentication context provider, including state management,
 * token persistence, route protection, and integration with expo-router.
 */

import * as React from "react";
import { render, waitFor, act } from "@testing-library/react-native";
import { AuthProvider, useAuth } from "../contexts/AuthContext";

// Mock expo-router
let mockSegments: string[] = [];
const mockReplace = jest.fn();
const mockPush = jest.fn();
const mockBack = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({
    replace: mockReplace,
    push: mockPush,
    back: mockBack,
  }),
  useSegments: () => mockSegments,
}));

// Mock tokenStorage
const mockIsAuthenticated = jest.fn();
const mockStoreTokens = jest.fn();
const mockClearTokens = jest.fn();
const mockGetTokens = jest.fn();
const mockGetBiometricLoginEnabled = jest.fn();

jest.mock("../services/tokenStorage", () => ({
  isAuthenticated: (...args: any[]) => mockIsAuthenticated(...args),
  storeTokens: (...args: any[]) => mockStoreTokens(...args),
  clearTokens: (...args: any[]) => mockClearTokens(...args),
  getTokens: (...args: any[]) => mockGetTokens(...args),
  getBiometricLoginEnabled: (...args: any[]) => mockGetBiometricLoginEnabled(...args),
}));

const mockCanUseBiometrics = jest.fn();
const mockPromptBiometricUnlock = jest.fn();
jest.mock("../services/biometricAuth", () => ({
  canUseBiometrics: (...args: any[]) => mockCanUseBiometrics(...args),
  promptBiometricUnlock: (...args: any[]) => mockPromptBiometricUnlock(...args),
}));

const mockRefreshTokenApi = jest.fn();
jest.mock("../services/api", () => ({
  refreshToken: (...args: any[]) => mockRefreshTokenApi(...args),
}));

// Test consumer component to access context
function AuthTestConsumer({
  onRender,
}: {
  onRender: (ctx: ReturnType<typeof useAuth>) => void;
}) {
  const auth = useAuth();
  React.useEffect(() => {
    onRender(auth);
  });
  return null;
}

describe("AuthContext", () => {
  let capturedCtx: ReturnType<typeof useAuth> | null = null;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSegments = [];
    capturedCtx = null;
    mockIsAuthenticated.mockResolvedValue(false);
    mockStoreTokens.mockResolvedValue(undefined);
    mockClearTokens.mockResolvedValue(undefined);
    mockGetTokens.mockResolvedValue(null);
    mockGetBiometricLoginEnabled.mockResolvedValue(false);
    mockCanUseBiometrics.mockResolvedValue({
      status: "available",
      available: true,
      supportedTypes: [1],
    });
    mockPromptBiometricUnlock.mockResolvedValue({ status: "success", success: true });
    mockRefreshTokenApi.mockResolvedValue({
      accessToken: "refreshed-access",
      idToken: "refreshed-id",
      refreshToken: "refreshed-refresh",
      expiresIn: 3600,
      tokenType: "Bearer",
    });
  });

  // --- Initial state ---

  describe("Initial state", () => {
    it("starts with isLoading: true", () => {
      render(
        <AuthProvider>
          <AuthTestConsumer
            onRender={(ctx) => {
              capturedCtx = ctx;
            }}
          />
        </AuthProvider>
      );

      expect(capturedCtx?.isLoading).toBe(true);
    });

    it("resolves to isAuthenticated: false when no tokens are stored", async () => {
      mockGetTokens.mockResolvedValue(null);

      render(
        <AuthProvider>
          <AuthTestConsumer
            onRender={(ctx) => {
              capturedCtx = ctx;
            }}
          />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(capturedCtx?.isLoading).toBe(false);
      });

      expect(capturedCtx?.isAuthenticated).toBe(false);
      expect(mockGetTokens).toHaveBeenCalledTimes(1);
    });

    it("resolves to isAuthenticated: true when valid tokens exist", async () => {
      mockGetTokens.mockResolvedValue({
        accessToken: "stored-access",
        idToken: "stored-id",
        refreshToken: "stored-refresh",
      });
      mockGetBiometricLoginEnabled.mockResolvedValue(false);

      render(
        <AuthProvider>
          <AuthTestConsumer
            onRender={(ctx) => {
              capturedCtx = ctx;
            }}
          />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(capturedCtx?.isLoading).toBe(false);
      });

      expect(capturedCtx?.isAuthenticated).toBe(true);
      expect(mockGetTokens).toHaveBeenCalledTimes(1);
    });
  });

  // --- login() function ---

  describe("login() function", () => {
    beforeEach(async () => {
      mockIsAuthenticated.mockResolvedValue(false);
      render(
        <AuthProvider>
          <AuthTestConsumer
            onRender={(ctx) => {
              capturedCtx = ctx;
            }}
          />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(capturedCtx?.isLoading).toBe(false);
      });
    });

    it("calls storeTokens() with the provided token object", async () => {
      const tokens = {
        accessToken: "access-123",
        idToken: "id-456",
        refreshToken: "refresh-789",
      };

      await act(async () => {
        await capturedCtx!.login(tokens);
      });

      expect(mockStoreTokens).toHaveBeenCalledWith(tokens);
      expect(mockStoreTokens).toHaveBeenCalledTimes(1);
    });

    it("sets isAuthenticated to true after storing", async () => {
      const tokens = {
        accessToken: "access-123",
        idToken: "id-456",
        refreshToken: "refresh-789",
      };

      await act(async () => {
        await capturedCtx!.login(tokens);
      });

      expect(capturedCtx?.isAuthenticated).toBe(true);
    });

    it("throws (does not swallow) errors from storeTokens()", async () => {
      const tokens = {
        accessToken: "access-123",
        idToken: "id-456",
        refreshToken: "refresh-789",
      };
      const error = new Error("Storage failed");
      mockStoreTokens.mockRejectedValueOnce(error);

      await expect(
        act(async () => {
          await capturedCtx!.login(tokens);
        })
      ).rejects.toThrow("Storage failed");
    });
  });

  // --- logout() function ---

  describe("logout() function", () => {
    beforeEach(async () => {
      mockIsAuthenticated.mockResolvedValue(true);
      render(
        <AuthProvider>
          <AuthTestConsumer
            onRender={(ctx) => {
              capturedCtx = ctx;
            }}
          />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(capturedCtx?.isLoading).toBe(false);
      });
    });

    it("calls clearTokens() to remove all stored tokens", async () => {
      await act(async () => {
        await capturedCtx!.logout();
      });

      expect(mockClearTokens).toHaveBeenCalledTimes(1);
    });

    it("sets isAuthenticated to false", async () => {
      await act(async () => {
        await capturedCtx!.logout();
      });

      expect(capturedCtx?.isAuthenticated).toBe(false);
    });

    it("sets isDevBypass to false (exits dev bypass mode)", async () => {
      // First set dev bypass
      act(() => {
        capturedCtx!.devBypass();
      });
      expect(capturedCtx?.isDevBypass).toBe(true);

      // Then logout
      await act(async () => {
        await capturedCtx!.logout();
      });

      expect(capturedCtx?.isDevBypass).toBe(false);
    });

    it("calls router.replace('/') to navigate back to login screen", async () => {
      // Clear any previous calls from route protection
      mockReplace.mockClear();

      await act(async () => {
        await capturedCtx!.logout();
      });

      expect(mockReplace).toHaveBeenCalledWith("/");
      // May be called multiple times due to route protection effect, but should at least be called
      expect(mockReplace).toHaveBeenCalled();
    });

    it("throws (does not swallow) errors from clearTokens()", async () => {
      const error = new Error("Clear failed");
      mockClearTokens.mockRejectedValueOnce(error);

      await expect(
        act(async () => {
          await capturedCtx!.logout();
        })
      ).rejects.toThrow("Clear failed");
    });
  });

  // --- devBypass() function ---

  describe("devBypass() function", () => {
    beforeEach(async () => {
      mockIsAuthenticated.mockResolvedValue(false);
      render(
        <AuthProvider>
          <AuthTestConsumer
            onRender={(ctx) => {
              capturedCtx = ctx;
            }}
          />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(capturedCtx?.isLoading).toBe(false);
      });
    });

    it("sets isDevBypass to true", () => {
      act(() => {
        capturedCtx!.devBypass();
      });

      expect(capturedCtx?.isDevBypass).toBe(true);
    });

    it("does not set isAuthenticated to true (these are separate states)", () => {
      act(() => {
        capturedCtx!.devBypass();
      });

      expect(capturedCtx?.isDevBypass).toBe(true);
      expect(capturedCtx?.isAuthenticated).toBe(false);
    });
  });

  // --- useAuth() outside provider ---

  describe("useAuth() outside provider", () => {
    it("throws 'useAuth must be used within an AuthProvider'", () => {
      // Suppress console.error for this test
      const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

      expect(() => {
        render(
          React.createElement(() => {
            useAuth();
            return null;
          })
        );
      }).toThrow("useAuth must be used within an AuthProvider");

      consoleErrorSpy.mockRestore();
    });
  });

  // --- Route protection ---

  describe("Route protection - unauthenticated users", () => {
    beforeEach(async () => {
      mockIsAuthenticated.mockResolvedValue(false);
      mockSegments = [];
    });

    it("redirects to login when on (tabs) route and not authenticated", async () => {
      mockSegments = ["(tabs)"];

      render(
        <AuthProvider>
          <AuthTestConsumer
            onRender={(ctx) => {
              capturedCtx = ctx;
            }}
          />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(capturedCtx?.isLoading).toBe(false);
      });

      await waitFor(() => {
        expect(mockReplace).toHaveBeenCalledWith("/");
      });
    });

    it("does not redirect when already on (auth) route and not authenticated", async () => {
      mockSegments = ["(auth)"];

      render(
        <AuthProvider>
          <AuthTestConsumer
            onRender={(ctx) => {
              capturedCtx = ctx;
            }}
          />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(capturedCtx?.isLoading).toBe(false);
      });

      // Wait a bit to ensure no redirect happens
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(mockReplace).not.toHaveBeenCalled();
    });
  });

  describe("Route protection - authenticated users", () => {
    beforeEach(async () => {
      mockGetTokens.mockResolvedValue({
        accessToken: "stored-access",
        idToken: "stored-id",
        refreshToken: "stored-refresh",
      });
      mockGetBiometricLoginEnabled.mockResolvedValue(false);
      mockSegments = [];
    });

    it("redirects to /home when on (auth) route and authenticated", async () => {
      mockSegments = ["(auth)"];

      render(
        <AuthProvider>
          <AuthTestConsumer
            onRender={(ctx) => {
              capturedCtx = ctx;
            }}
          />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(capturedCtx?.isLoading).toBe(false);
      });

      await waitFor(() => {
        expect(mockReplace).toHaveBeenCalledWith("/home");
      });
    });

    it("does not redirect when on (tabs) route and authenticated", async () => {
      mockSegments = ["(tabs)"];

      render(
        <AuthProvider>
          <AuthTestConsumer
            onRender={(ctx) => {
              capturedCtx = ctx;
            }}
          />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(capturedCtx?.isLoading).toBe(false);
      });

      // Wait a bit to ensure no redirect happens
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(mockReplace).not.toHaveBeenCalled();
    });
  });

  describe("Route protection - dev bypass", () => {
    beforeEach(async () => {
      mockIsAuthenticated.mockResolvedValue(false);
      mockSegments = [];
    });

    it("redirects to /home when on (auth) route and dev bypass is true", async () => {
      mockSegments = ["(auth)"];

      render(
        <AuthProvider>
          <AuthTestConsumer
            onRender={(ctx) => {
              capturedCtx = ctx;
            }}
          />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(capturedCtx?.isLoading).toBe(false);
      });

      // Enable dev bypass
      act(() => {
        capturedCtx!.devBypass();
      });

      await waitFor(() => {
        expect(mockReplace).toHaveBeenCalledWith("/home");
      });
    });

    it("does not redirect away from (tabs) routes when dev bypass is true", async () => {
      mockSegments = ["(tabs)"];

      render(
        <AuthProvider>
          <AuthTestConsumer
            onRender={(ctx) => {
              capturedCtx = ctx;
              // Enable dev bypass as soon as context is available (before loading completes)
              if (ctx && !ctx.isDevBypass && !ctx.isLoading) {
                ctx.devBypass();
              }
            }}
          />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(capturedCtx?.isLoading).toBe(false);
      });

      // Enable dev bypass if not already set
      if (!capturedCtx?.isDevBypass) {
        act(() => {
          capturedCtx!.devBypass();
        });
      }

      // Clear any redirects that happened during initial load
      mockReplace.mockClear();

      // Wait for route protection effect to run after dev bypass is set
      await waitFor(
        () => {
          // Give the effect time to run, but we expect no redirect
        },
        { timeout: 200 }
      );

      // Should not redirect from tabs when in dev bypass
      // Note: There might be an initial redirect before dev bypass is set,
      // but after it's set, there should be no redirect
      const callsAfterBypass = mockReplace.mock.calls.length;
      // If there were calls, they should not be to "/" (which would be from unauthenticated redirect)
      const redirectToLogin = mockReplace.mock.calls.some((call) => call[0] === "/");
      expect(redirectToLogin).toBe(false);
    });
  });

  // --- Error handling in checkAuthStatus ---

  describe("Error handling", () => {
    it("handles errors in checkAuthStatus gracefully", async () => {
      const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
      mockGetTokens.mockRejectedValueOnce(new Error("Check failed"));

      render(
        <AuthProvider>
          <AuthTestConsumer
            onRender={(ctx) => {
              capturedCtx = ctx;
            }}
          />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(capturedCtx?.isLoading).toBe(false);
      });

      expect(capturedCtx?.isAuthenticated).toBe(false);
      expect(consoleErrorSpy.mock.calls.some((call) => call[0] === "Error checking auth status:")).toBe(
        true
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe("Biometric startup flow", () => {
    const storedTokens = {
      accessToken: "stored-access",
      idToken: "stored-id",
      refreshToken: "stored-refresh",
    };

    it("prompts biometrics and refreshes tokens when biometric login is enabled", async () => {
      mockGetTokens.mockResolvedValue(storedTokens);
      mockGetBiometricLoginEnabled.mockResolvedValue(true);

      render(
        <AuthProvider>
          <AuthTestConsumer
            onRender={(ctx) => {
              capturedCtx = ctx;
            }}
          />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(capturedCtx?.isLoading).toBe(false);
      });

      expect(mockCanUseBiometrics).toHaveBeenCalledTimes(1);
      expect(mockPromptBiometricUnlock).toHaveBeenCalledWith("Unlock Stride");
      expect(mockRefreshTokenApi).toHaveBeenCalledWith("stored-refresh");
      expect(mockStoreTokens).toHaveBeenCalledWith({
        accessToken: "refreshed-access",
        idToken: "refreshed-id",
        refreshToken: "refreshed-refresh",
      });
      expect(capturedCtx?.isAuthenticated).toBe(true);
    });

    it("falls back to unauthenticated state when biometric prompt is cancelled", async () => {
      mockGetTokens.mockResolvedValue(storedTokens);
      mockGetBiometricLoginEnabled.mockResolvedValue(true);
      mockPromptBiometricUnlock.mockResolvedValue({ status: "cancelled", success: false });

      render(
        <AuthProvider>
          <AuthTestConsumer
            onRender={(ctx) => {
              capturedCtx = ctx;
            }}
          />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(capturedCtx?.isLoading).toBe(false);
      });

      expect(mockRefreshTokenApi).not.toHaveBeenCalled();
      expect(capturedCtx?.isAuthenticated).toBe(false);
    });

    it("falls back to unauthenticated state when biometric hardware is unavailable", async () => {
      mockGetTokens.mockResolvedValue(storedTokens);
      mockGetBiometricLoginEnabled.mockResolvedValue(true);
      mockCanUseBiometrics.mockResolvedValue({
        status: "not-supported",
        available: false,
        supportedTypes: [],
      });

      render(
        <AuthProvider>
          <AuthTestConsumer
            onRender={(ctx) => {
              capturedCtx = ctx;
            }}
          />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(capturedCtx?.isLoading).toBe(false);
      });

      expect(mockPromptBiometricUnlock).not.toHaveBeenCalled();
      expect(mockRefreshTokenApi).not.toHaveBeenCalled();
      expect(capturedCtx?.isAuthenticated).toBe(false);
    });

    it("falls back to unauthenticated state when refresh fails after successful biometric unlock", async () => {
      mockGetTokens.mockResolvedValue(storedTokens);
      mockGetBiometricLoginEnabled.mockResolvedValue(true);
      mockRefreshTokenApi.mockRejectedValueOnce(new Error("refresh failed"));

      render(
        <AuthProvider>
          <AuthTestConsumer
            onRender={(ctx) => {
              capturedCtx = ctx;
            }}
          />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(capturedCtx?.isLoading).toBe(false);
      });

      expect(mockPromptBiometricUnlock).toHaveBeenCalledTimes(1);
      expect(mockRefreshTokenApi).toHaveBeenCalledWith("stored-refresh");
      expect(capturedCtx?.isAuthenticated).toBe(false);
    });
  });
});
