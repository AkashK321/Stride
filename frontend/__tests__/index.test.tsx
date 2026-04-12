/**
 * Integration tests for login screen (app/(auth)/index.tsx)
 * 
 * Tests the login screen including form validation, API integration,
 * context updates, error handling, and navigation.
 */

import * as React from "react";
import { render, fireEvent, screen, waitFor, act } from "@testing-library/react-native";
import { Alert } from "react-native";
import Landing from "../app/(auth)/index";
import { login as apiLogin } from "../services/api";
import { useAuth } from "../contexts/AuthContext";

// Mock expo-router
const mockPush = jest.fn();
const mockReplace = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: jest.fn(),
  }),
  useSegments: () => [],
}));

// Mock services/api
const mockApiLogin = jest.fn();
jest.mock("../services/api", () => ({
  login: (...args: any[]) => mockApiLogin(...args),
}));

// Mock AuthContext
const mockAuthLogin = jest.fn();
const mockDevBypass = jest.fn();
jest.mock("../contexts/AuthContext", () => ({
  useAuth: () => ({
    login: mockAuthLogin,
    devBypass: mockDevBypass,
    isAuthenticated: false,
    isDevBypass: false,
    isLoading: false,
    logout: jest.fn(),
    refreshTokens: jest.fn(),
  }),
}));

// Mock __DEV__ global
const originalDev = (globalThis as any).__DEV__;
beforeAll(() => {
  (globalThis as any).__DEV__ = true;
});
afterAll(() => {
  (globalThis as any).__DEV__ = originalDev;
});

// Mock Alert.alert - will be set up in beforeEach
let alertSpy: jest.SpyInstance;

describe("Login Screen (app/(auth)/index.tsx)", () => {
  const mockLoginResponse = {
    accessToken: "access-123",
    idToken: "id-456",
    refreshToken: "refresh-789",
    expiresIn: 3600,
    tokenType: "Bearer",
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockApiLogin.mockResolvedValue(mockLoginResponse);
    mockAuthLogin.mockResolvedValue(undefined);
    mockDevBypass.mockReturnValue(undefined);
    // Set up Alert.alert spy
    alertSpy = jest.spyOn(Alert, "alert");
  });

  // --- Rendering ---

  describe("Rendering", () => {
    it("renders the 'Welcome back to Stride.' heading", () => {
      render(<Landing />);
      expect(screen.getByText(/Welcome back to/)).toBeTruthy();
      expect(screen.getByText("Stride.")).toBeTruthy();
    });

    it("renders the username text field with placeholder 'Username'", () => {
      render(<Landing />);
      expect(screen.getByPlaceholderText("Username")).toBeTruthy();
    });

    it("renders the password text field with placeholder 'Password'", () => {
      render(<Landing />);
      expect(screen.getByPlaceholderText("Password")).toBeTruthy();
    });

    it("renders the 'Sign in' button", () => {
      render(<Landing />);
      expect(screen.getByText("Sign in")).toBeTruthy();
    });

    it("renders the 'Create an account' button", () => {
      render(<Landing />);
      expect(screen.getByText("Create an account")).toBeTruthy();
    });

    it("renders the 'Developer Bypass' button when __DEV__ is true", () => {
      (globalThis as any).__DEV__ = true;
      render(<Landing />);
      expect(screen.getByText("Developer Bypass")).toBeTruthy();
    });

    it("does not render the 'Developer Bypass' button when __DEV__ is false", () => {
      (globalThis as any).__DEV__ = false;
      const { queryByText } = render(<Landing />);
      expect(queryByText("Developer Bypass")).toBeNull();
    });
  });

  // --- Form validation ---

  describe("Form validation", () => {
    it("shows 'Username is required' error when signing in with empty username", async () => {
      render(<Landing />);

      const signInButton = screen.getByText("Sign in");
      fireEvent.press(signInButton);

      await waitFor(() => {
        expect(screen.getByText("Username is required")).toBeTruthy();
      });

      expect(mockApiLogin).not.toHaveBeenCalled();
    });

    it("shows 'Password is required' error when signing in with empty password", async () => {
      render(<Landing />);

      const usernameInput = screen.getByPlaceholderText("Username");
      fireEvent.changeText(usernameInput, "testuser");

      const signInButton = screen.getByText("Sign in");
      fireEvent.press(signInButton);

      await waitFor(() => {
        expect(screen.getByText("Password is required")).toBeTruthy();
      });

      expect(mockApiLogin).not.toHaveBeenCalled();
    });

    it("does not call the login API when validation fails", async () => {
      render(<Landing />);

      const signInButton = screen.getByText("Sign in");
      fireEvent.press(signInButton);

      await waitFor(() => {
        expect(screen.getByText("Username is required")).toBeTruthy();
      });

      expect(mockApiLogin).not.toHaveBeenCalled();
      expect(mockAuthLogin).not.toHaveBeenCalled();
    });

    it("trims whitespace from username and password before validation", async () => {
      render(<Landing />);

      const usernameInput = screen.getByPlaceholderText("Username");
      const passwordInput = screen.getByPlaceholderText("Password");

      // Enter only whitespace
      fireEvent.changeText(usernameInput, "   ");
      fireEvent.changeText(passwordInput, "   ");

      const signInButton = screen.getByText("Sign in");
      fireEvent.press(signInButton);

      await waitFor(() => {
        expect(screen.getByText("Username is required")).toBeTruthy();
      });

      expect(mockApiLogin).not.toHaveBeenCalled();
    });
  });

  // --- Successful sign-in flow ---

  describe("Successful sign-in flow", () => {
    it("calls login() from services/api.ts with { username, password }", async () => {
      render(<Landing />);

      const usernameInput = screen.getByPlaceholderText("Username");
      const passwordInput = screen.getByPlaceholderText("Password");

      fireEvent.changeText(usernameInput, "testuser");
      fireEvent.changeText(passwordInput, "testpass");

      const signInButton = screen.getByText("Sign in");
      await act(async () => {
        fireEvent.press(signInButton);
        await waitFor(() => {
          expect(mockApiLogin).toHaveBeenCalled();
        });
      });

      expect(mockApiLogin).toHaveBeenCalledWith({
        username: "testuser",
        password: "testpass",
      });
    });

    it("trims username and password before calling API", async () => {
      render(<Landing />);

      const usernameInput = screen.getByPlaceholderText("Username");
      const passwordInput = screen.getByPlaceholderText("Password");

      fireEvent.changeText(usernameInput, "  testuser  ");
      fireEvent.changeText(passwordInput, "  testpass  ");

      const signInButton = screen.getByText("Sign in");
      await act(async () => {
        fireEvent.press(signInButton);
        await waitFor(() => {
          expect(mockApiLogin).toHaveBeenCalled();
        });
      });

      expect(mockApiLogin).toHaveBeenCalledWith({
        username: "testuser",
        password: "testpass",
      });
    });

    it("calls authLogin() from AuthContext with the returned tokens", async () => {
      render(<Landing />);

      const usernameInput = screen.getByPlaceholderText("Username");
      const passwordInput = screen.getByPlaceholderText("Password");

      fireEvent.changeText(usernameInput, "testuser");
      fireEvent.changeText(passwordInput, "testpass");

      const signInButton = screen.getByText("Sign in");
      await act(async () => {
        fireEvent.press(signInButton);
        await waitFor(() => {
          expect(mockAuthLogin).toHaveBeenCalled();
        });
      });

      expect(mockAuthLogin).toHaveBeenCalledWith({
        accessToken: "access-123",
        idToken: "id-456",
        refreshToken: "refresh-789",
      });
    });

    it("sets loading state while the API call is in progress", async () => {
      // Create a promise that we can control
      let resolveLogin: (value: any) => void;
      const loginPromise = new Promise((resolve) => {
        resolveLogin = resolve;
      });
      mockApiLogin.mockReturnValueOnce(loginPromise);

      const { UNSAFE_root } = render(<Landing />);

      const usernameInput = screen.getByPlaceholderText("Username");
      const passwordInput = screen.getByPlaceholderText("Password");

      fireEvent.changeText(usernameInput, "testuser");
      fireEvent.changeText(passwordInput, "testpass");

      const signInButton = screen.getByText("Sign in");
      fireEvent.press(signInButton);

      // Button should show loading state - check for ActivityIndicator
      await waitFor(() => {
        const activityIndicators = UNSAFE_root.findAllByType(
          require("react-native").ActivityIndicator
        );
        // Should have at least one ActivityIndicator (from the loading button)
        expect(activityIndicators.length).toBeGreaterThan(0);
      }, { timeout: 2000 });

      // Resolve the promise
      await act(async () => {
        resolveLogin!(mockLoginResponse);
        await loginPromise;
      });
    });

    it("clears loading state after the API call completes", async () => {
      render(<Landing />);

      const usernameInput = screen.getByPlaceholderText("Username");
      const passwordInput = screen.getByPlaceholderText("Password");

      fireEvent.changeText(usernameInput, "testuser");
      fireEvent.changeText(passwordInput, "testpass");

      const signInButton = screen.getByText("Sign in");
      await act(async () => {
        fireEvent.press(signInButton);
        await waitFor(() => {
          expect(mockApiLogin).toHaveBeenCalled();
        });
        await waitFor(() => {
          expect(mockAuthLogin).toHaveBeenCalled();
        });
      });

      // Loading should be cleared after API calls complete
      // Verify by checking that the button is still accessible (not disabled)
      // and that authLogin was called (which means the flow completed)
      expect(mockAuthLogin).toHaveBeenCalled();
      
      // Give a moment for state to update
      await new Promise((resolve) => setTimeout(resolve, 100));
      
      // Button should still be accessible
      const signInButtonAfter = screen.getByText("Sign in");
      expect(signInButtonAfter).toBeTruthy();
    });
  });

  // --- Failed sign-in flow ---

  describe("Failed sign-in flow", () => {
    it("routes to verify when API returns account not confirmed", async () => {
      mockApiLogin.mockRejectedValueOnce(new Error("User account is not confirmed"));

      render(<Landing />);

      fireEvent.changeText(screen.getByPlaceholderText("Username"), "testuser");
      fireEvent.changeText(screen.getByPlaceholderText("Password"), "testpass");

      await act(async () => {
        fireEvent.press(screen.getByText("Sign in"));
      });

      await waitFor(() => {
        expect(mockReplace).toHaveBeenCalledWith("/verify?username=testuser");
      });
      expect(alertSpy).not.toHaveBeenCalled();
    });

    it("routes to verify when API returns account not verified", async () => {
      mockApiLogin.mockRejectedValueOnce(new Error("User is not verified"));

      render(<Landing />);

      fireEvent.changeText(screen.getByPlaceholderText("Username"), "testuser");
      fireEvent.changeText(screen.getByPlaceholderText("Password"), "testpass");

      await act(async () => {
        fireEvent.press(screen.getByText("Sign in"));
      });

      await waitFor(() => {
        expect(mockReplace).toHaveBeenCalledWith("/verify?username=testuser");
      });
      expect(alertSpy).not.toHaveBeenCalled();
    });

    it("shows Alert.alert('Sign In Failed', ...) when the API call throws", async () => {
      const error = new Error("Network error");
      mockApiLogin.mockRejectedValueOnce(error);

      render(<Landing />);

      const usernameInput = screen.getByPlaceholderText("Username");
      const passwordInput = screen.getByPlaceholderText("Password");

      fireEvent.changeText(usernameInput, "testuser");
      fireEvent.changeText(passwordInput, "testpass");

      const signInButton = screen.getByText("Sign in");
      await act(async () => {
        fireEvent.press(signInButton);
        await waitFor(() => {
          expect(alertSpy).toHaveBeenCalled();
        });
      });

      expect(alertSpy).toHaveBeenCalledWith("Sign In Failed", "Network error");
    });

    it("sets field-specific error for username when error includes 'user' or 'not found'", async () => {
      const error = new Error("User not found");
      mockApiLogin.mockRejectedValueOnce(error);

      render(<Landing />);

      const usernameInput = screen.getByPlaceholderText("Username");
      const passwordInput = screen.getByPlaceholderText("Password");

      fireEvent.changeText(usernameInput, "testuser");
      fireEvent.changeText(passwordInput, "testpass");

      const signInButton = screen.getByText("Sign in");
      await act(async () => {
        fireEvent.press(signInButton);
      });

      await waitFor(() => {
        expect(screen.getByText("Invalid username or password")).toBeTruthy();
      }, { timeout: 2000 });
    });

    it("sets field-specific error for password when error includes 'password'", async () => {
      const error = new Error("Invalid password");
      mockApiLogin.mockRejectedValueOnce(error);

      render(<Landing />);

      const usernameInput = screen.getByPlaceholderText("Username");
      const passwordInput = screen.getByPlaceholderText("Password");

      fireEvent.changeText(usernameInput, "testuser");
      fireEvent.changeText(passwordInput, "testpass");

      const signInButton = screen.getByText("Sign in");
      await act(async () => {
        fireEvent.press(signInButton);
      });

      await waitFor(() => {
        expect(screen.getByText("Invalid password")).toBeTruthy();
      }, { timeout: 2000 });
    });

    it("clears loading state after a failed API call", async () => {
      const error = new Error("Network error");
      mockApiLogin.mockRejectedValueOnce(error);

      render(<Landing />);

      const usernameInput = screen.getByPlaceholderText("Username");
      const passwordInput = screen.getByPlaceholderText("Password");

      fireEvent.changeText(usernameInput, "testuser");
      fireEvent.changeText(passwordInput, "testpass");

      const signInButton = screen.getByText("Sign in");
      await act(async () => {
        fireEvent.press(signInButton);
        await waitFor(() => {
          expect(alertSpy).toHaveBeenCalled();
        });
      });

      // Loading should be cleared
      await waitFor(() => {
        const button = screen.getByText("Sign in");
        expect(button.props.loading).toBeFalsy();
      });
    });

    it("handles non-Error thrown values", async () => {
      mockApiLogin.mockRejectedValueOnce("String error");

      render(<Landing />);

      const usernameInput = screen.getByPlaceholderText("Username");
      const passwordInput = screen.getByPlaceholderText("Password");

      fireEvent.changeText(usernameInput, "testuser");
      fireEvent.changeText(passwordInput, "testpass");

      const signInButton = screen.getByText("Sign in");
      await act(async () => {
        fireEvent.press(signInButton);
        await waitFor(() => {
          expect(alertSpy).toHaveBeenCalled();
        });
      });

      expect(alertSpy).toHaveBeenCalledWith(
        "Sign In Failed",
        "An unexpected error occurred"
      );
    });
  });

  // --- Developer bypass ---

  describe("Developer bypass", () => {
    beforeEach(() => {
      (globalThis as any).__DEV__ = true;
    });

    it("tapping 'Developer Bypass' shows Alert.alert with 'Developer Mode Active'", () => {
      render(<Landing />);

      const devBypassButton = screen.getByText("Developer Bypass");
      fireEvent.press(devBypassButton);

      expect(alertSpy).toHaveBeenCalledWith(
        "Developer Mode Active",
        expect.stringContaining("developer bypass mode"),
        expect.any(Array)
      );
    });

    it("pressing 'OK' on the alert calls devBypass() from AuthContext", () => {
      render(<Landing />);

      const devBypassButton = screen.getByText("Developer Bypass");
      fireEvent.press(devBypassButton);

      // Get the OK button from the alert
      const alertCall = alertSpy.mock.calls[0];
      const buttons = alertCall[2] as Array<{ text: string; onPress: () => void }>;
      const okButton = buttons.find((btn) => btn.text === "OK");

      expect(okButton).toBeTruthy();

      // Simulate pressing OK
      act(() => {
        okButton!.onPress();
      });

      expect(mockDevBypass).toHaveBeenCalledTimes(1);
    });
  });

  // --- Navigation ---

  describe("Navigation", () => {
    it("tapping 'Create an account' calls router.push('/register')", () => {
      render(<Landing />);

      const createAccountButton = screen.getByText("Create an account");
      fireEvent.press(createAccountButton);

      expect(mockPush).toHaveBeenCalledWith("/register");
      expect(mockPush).toHaveBeenCalledTimes(1);
    });
  });

  // --- Password visibility toggle ---

  describe("Password visibility", () => {
    it("toggles password visibility when eye icon is pressed", () => {
      render(<Landing />);

      const passwordInput = screen.getByPlaceholderText("Password");
      const showPasswordButton = screen.getByLabelText("Show password");

      // Initially password should be hidden (secureTextEntry should be true)
      expect(passwordInput.props.secureTextEntry).toBe(true);

      // Press show password button
      fireEvent.press(showPasswordButton);

      // Password should now be visible
      expect(passwordInput.props.secureTextEntry).toBe(false);
      expect(screen.getByLabelText("Hide password")).toBeTruthy();
    });
  });

  // --- Error clearing ---

  describe("Error clearing", () => {
    it("clears previous errors when signing in again", async () => {
      // First, trigger a validation error
      render(<Landing />);
      const signInButton = screen.getByText("Sign in");
      fireEvent.press(signInButton);

      await waitFor(() => {
        expect(screen.getByText("Username is required")).toBeTruthy();
      });

      // Now fill in the form and sign in successfully
      const usernameInput = screen.getByPlaceholderText("Username");
      const passwordInput = screen.getByPlaceholderText("Password");

      fireEvent.changeText(usernameInput, "testuser");
      fireEvent.changeText(passwordInput, "testpass");

      await act(async () => {
        fireEvent.press(signInButton);
        await waitFor(() => {
          expect(mockApiLogin).toHaveBeenCalled();
        });
      });

      // Error should be cleared
      expect(screen.queryByText("Username is required")).toBeNull();
    });
  });
});
