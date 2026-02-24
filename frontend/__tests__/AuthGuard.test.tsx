/**
 * Integration tests for AuthGuard component
 * 
 * Tests route protection, loading states, authentication checks,
 * dev bypass mode, and navigation redirects.
 */

import * as React from "react";
import { render, screen, waitFor, act } from "@testing-library/react-native";
import { Text } from "react-native";
import { AuthGuard } from "../components/AuthGuard";
import { useAuth } from "../contexts/AuthContext";

// Mock expo-router
const mockReplace = jest.fn();
let mockSegments: string[] = [];

jest.mock("expo-router", () => ({
  useRouter: () => ({
    replace: mockReplace,
    push: jest.fn(),
    back: jest.fn(),
  }),
  useSegments: () => mockSegments,
}));

// Mock AuthContext
let mockIsAuthenticated = false;
let mockIsDevBypass = false;
let mockIsLoading = false;

jest.mock("../contexts/AuthContext", () => ({
  useAuth: () => ({
    isAuthenticated: mockIsAuthenticated,
    isDevBypass: mockIsDevBypass,
    isLoading: mockIsLoading,
    login: jest.fn(),
    logout: jest.fn(),
    refreshTokens: jest.fn(),
    devBypass: jest.fn(),
  }),
}));

describe("AuthGuard", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsAuthenticated = false;
    mockIsDevBypass = false;
    mockIsLoading = false;
    mockSegments = ["(tabs)"]; // Default to tabs group
    mockReplace.mockClear();
  });

  // --- Loading state ---

  describe("Loading state", () => {
    it("shows ActivityIndicator when isLoading is true", () => {
      mockIsLoading = true;

      const { UNSAFE_root } = render(
        <AuthGuard>
          <Text>Protected Content</Text>
        </AuthGuard>
      );

      const activityIndicators = UNSAFE_root.findAllByType(
        require("react-native").ActivityIndicator
      );
      expect(activityIndicators.length).toBeGreaterThan(0);
      expect(screen.queryByText("Protected Content")).toBeNull();
    });

    it("shows custom fallback when isLoading is true and fallback is provided", () => {
      mockIsLoading = true;

      render(
        <AuthGuard fallback={<Text>Custom Loading...</Text>}>
          <Text>Protected Content</Text>
        </AuthGuard>
      );

      expect(screen.getByText("Custom Loading...")).toBeTruthy();
      expect(screen.queryByText("Protected Content")).toBeNull();
    });

    it("does not redirect when isLoading is true", () => {
      mockIsLoading = true;
      mockIsAuthenticated = false;

      render(
        <AuthGuard>
          <Text>Protected Content</Text>
        </AuthGuard>
      );

      expect(mockReplace).not.toHaveBeenCalled();
    });
  });

  // --- Authenticated state ---

  describe("Authenticated state", () => {
    it("renders children when user is authenticated", () => {
      mockIsAuthenticated = true;
      mockIsLoading = false;

      render(
        <AuthGuard>
          <Text>Protected Content</Text>
        </AuthGuard>
      );

      expect(screen.getByText("Protected Content")).toBeTruthy();
    });

    it("does not redirect when user is authenticated", () => {
      mockIsAuthenticated = true;
      mockIsLoading = false;

      render(
        <AuthGuard>
          <Text>Protected Content</Text>
        </AuthGuard>
      );

      expect(mockReplace).not.toHaveBeenCalled();
    });

    it("renders children even when in auth group and authenticated", () => {
      mockIsAuthenticated = true;
      mockIsLoading = false;
      mockSegments = ["(auth)"];

      render(
        <AuthGuard>
          <Text>Protected Content</Text>
        </AuthGuard>
      );

      expect(screen.getByText("Protected Content")).toBeTruthy();
    });
  });

  // --- Unauthenticated state ---

  describe("Unauthenticated state", () => {
    it("does not render children when user is not authenticated", () => {
      mockIsAuthenticated = false;
      mockIsLoading = false;
      mockIsDevBypass = false;

      render(
        <AuthGuard>
          <Text>Protected Content</Text>
        </AuthGuard>
      );

      expect(screen.queryByText("Protected Content")).toBeNull();
    });

    it("redirects to '/' when user is not authenticated and not in auth group", async () => {
      mockIsAuthenticated = false;
      mockIsLoading = false;
      mockIsDevBypass = false;
      mockSegments = ["(tabs)"]; // Not in auth group

      render(
        <AuthGuard>
          <Text>Protected Content</Text>
        </AuthGuard>
      );

      await waitFor(() => {
        expect(mockReplace).toHaveBeenCalledWith("/");
      });
    });

    it("does not redirect when user is not authenticated but already in auth group", async () => {
      mockIsAuthenticated = false;
      mockIsLoading = false;
      mockIsDevBypass = false;
      mockSegments = ["(auth)"]; // Already in auth group

      render(
        <AuthGuard>
          <Text>Protected Content</Text>
        </AuthGuard>
      );

      // Wait a bit to ensure redirect doesn't happen
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(mockReplace).not.toHaveBeenCalled();
    });

    it("returns null when user is not authenticated and no fallback is provided", () => {
      mockIsAuthenticated = false;
      mockIsLoading = false;
      mockIsDevBypass = false;

      const { UNSAFE_root } = render(
        <AuthGuard>
          <Text>Protected Content</Text>
        </AuthGuard>
      );

      // Component should return null (no children rendered)
      expect(screen.queryByText("Protected Content")).toBeNull();
      
      // Verify no View or ActivityIndicator is rendered (just null)
      const views = UNSAFE_root.findAllByType(require("react-native").View);
      const activityIndicators = UNSAFE_root.findAllByType(
        require("react-native").ActivityIndicator
      );
      // Should have no views or activity indicators (component returns null)
      expect(views.length).toBe(0);
      expect(activityIndicators.length).toBe(0);
    });

    it("renders custom fallback when user is not authenticated and fallback is provided", () => {
      mockIsAuthenticated = false;
      mockIsLoading = false;
      mockIsDevBypass = false;

      render(
        <AuthGuard fallback={<Text>Access Denied</Text>}>
          <Text>Protected Content</Text>
        </AuthGuard>
      );

      expect(screen.getByText("Access Denied")).toBeTruthy();
      expect(screen.queryByText("Protected Content")).toBeNull();
    });
  });

  // --- Dev bypass mode ---

  describe("Dev bypass mode", () => {
    it("renders children when in dev bypass mode", () => {
      mockIsAuthenticated = false;
      mockIsLoading = false;
      mockIsDevBypass = true;

      render(
        <AuthGuard>
          <Text>Protected Content</Text>
        </AuthGuard>
      );

      expect(screen.getByText("Protected Content")).toBeTruthy();
    });

    it("does not redirect when in dev bypass mode", async () => {
      mockIsAuthenticated = false;
      mockIsLoading = false;
      mockIsDevBypass = true;
      mockSegments = ["(tabs)"];

      render(
        <AuthGuard>
          <Text>Protected Content</Text>
        </AuthGuard>
      );

      // Wait a bit to ensure redirect doesn't happen
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(mockReplace).not.toHaveBeenCalled();
    });

    it("renders children even when not authenticated if in dev bypass mode", () => {
      mockIsAuthenticated = false;
      mockIsLoading = false;
      mockIsDevBypass = true;

      render(
        <AuthGuard>
          <Text>Protected Content</Text>
        </AuthGuard>
      );

      expect(screen.getByText("Protected Content")).toBeTruthy();
    });
  });

  // --- State transitions ---

  describe("State transitions", () => {
    it("updates when authentication state changes from loading to authenticated", async () => {
      mockIsLoading = true;

      const { rerender } = render(
        <AuthGuard>
          <Text>Protected Content</Text>
        </AuthGuard>
      );

      // Initially should show loading
      expect(screen.queryByText("Protected Content")).toBeNull();

      // Update to authenticated
      mockIsLoading = false;
      mockIsAuthenticated = true;

      await act(async () => {
        rerender(
          <AuthGuard>
            <Text>Protected Content</Text>
          </AuthGuard>
        );
      });

      // Should now show content
      expect(screen.getByText("Protected Content")).toBeTruthy();
    });

    it("updates when authentication state changes from loading to unauthenticated", async () => {
      mockIsLoading = true;

      const { rerender } = render(
        <AuthGuard>
          <Text>Protected Content</Text>
        </AuthGuard>
      );

      // Initially should show loading
      expect(screen.queryByText("Protected Content")).toBeNull();

      // Update to unauthenticated
      mockIsLoading = false;
      mockIsAuthenticated = false;

      await act(async () => {
        rerender(
          <AuthGuard>
            <Text>Protected Content</Text>
          </AuthGuard>
        );
      });

      // Should not show content
      expect(screen.queryByText("Protected Content")).toBeNull();
    });

    it("updates redirect when segments change", async () => {
      mockIsAuthenticated = false;
      mockIsLoading = false;
      mockIsDevBypass = false;
      mockSegments = ["(tabs)"];

      const { rerender } = render(
        <AuthGuard>
          <Text>Protected Content</Text>
        </AuthGuard>
      );

      await waitFor(() => {
        expect(mockReplace).toHaveBeenCalledWith("/");
      });

      // Change segments to auth group
      mockSegments = ["(auth)"];
      mockReplace.mockClear();

      await act(async () => {
        rerender(
          <AuthGuard>
            <Text>Protected Content</Text>
          </AuthGuard>
        );
      });

      // Should not redirect when in auth group
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(mockReplace).not.toHaveBeenCalled();
    });
  });

  // --- Multiple children ---

  describe("Multiple children", () => {
    it("renders multiple children when authenticated", () => {
      mockIsAuthenticated = true;
      mockIsLoading = false;

      render(
        <AuthGuard>
          <Text>First Child</Text>
          <Text>Second Child</Text>
        </AuthGuard>
      );

      expect(screen.getByText("First Child")).toBeTruthy();
      expect(screen.getByText("Second Child")).toBeTruthy();
    });
  });
});
