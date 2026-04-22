/**
 * Integration tests for registration screen Step 2 (app/(auth)/register-credentials.tsx)
 * 
 * Tests the second step of registration including username/password validation,
 * password requirements, password matching, navigation, and params handling.
 */

import * as React from "react";
import { render, fireEvent, screen, waitFor, act } from "@testing-library/react-native";
import { Alert, Keyboard } from "react-native";
import RegisterCredentials from "../app/(auth)/register-credentials";

const mockCheckUsernameAvailability = jest.fn();

jest.mock("../services/api", () => ({
  checkUsernameAvailability: (...args: any[]) => mockCheckUsernameAvailability(...args),
}));

// Mock expo-router
const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();
let mockParams: Record<string, string> = {};

jest.mock("expo-router", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: mockBack,
  }),
  useSegments: () => [],
  useLocalSearchParams: () => mockParams,
}));

// Mock Keyboard - extend the existing mock from jest.setup-early.js
const mockKeyboardListeners: Array<{ event: string; callback: (e: any) => void }> = [];
const ReactNative = require("react-native");
// Override Keyboard.addListener to track listeners
ReactNative.Keyboard.addListener = jest.fn((event: string, callback: (e: any) => void) => {
  mockKeyboardListeners.push({ event, callback });
  return { remove: jest.fn() };
});

// Mock Alert.alert
const alertSpy = jest.spyOn(Alert, "alert");

describe("Register Credentials Screen Step 2 (app/(auth)/register-credentials.tsx)", () => {
  const waitForUsernameAvailabilityCheck = async (expectedUsername: string) => {
    await waitFor(() => {
      expect(mockCheckUsernameAvailability).toHaveBeenCalledWith(expectedUsername);
    });
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockKeyboardListeners.length = 0;
    mockParams = {
      firstName: "John",
      lastName: "Doe",
    };
    mockCheckUsernameAvailability.mockResolvedValue({ available: true, error: false });
    alertSpy.mockClear();
  });

  // --- Rendering ---

  describe("Rendering", () => {
    it("renders the 'Create your Stride account' heading", () => {
      render(<RegisterCredentials />);
      expect(screen.getByText(/Create your.*Stride.*account/)).toBeTruthy();
    });

    it("renders the 'Step 2 of 3: Username & Password' label", () => {
      render(<RegisterCredentials />);
      expect(screen.getByText("Step 2 of 3: Username & Password")).toBeTruthy();
    });

    it("renders the username text field", () => {
      render(<RegisterCredentials />);
      expect(screen.getByPlaceholderText("Username")).toBeTruthy();
    });

    it("renders the password text field", () => {
      render(<RegisterCredentials />);
      expect(screen.getByPlaceholderText("Password")).toBeTruthy();
    });

    it("renders the confirm password text field", () => {
      render(<RegisterCredentials />);
      expect(screen.getByPlaceholderText("Confirm Password")).toBeTruthy();
    });

    it("renders the 'Continue' button", () => {
      render(<RegisterCredentials />);
      expect(screen.getByText("Continue")).toBeTruthy();
    });

    it("renders the 'Back' button", () => {
      render(<RegisterCredentials />);
      expect(screen.getByText("Back")).toBeTruthy();
    });
  });

  // --- Username validation ---

  describe("Username validation", () => {
    it("shows 'Username is required' error when continuing with empty username", async () => {
      render(<RegisterCredentials />);

      const continueButton = screen.getByText("Continue");
      fireEvent.press(continueButton);

      await waitFor(() => {
        expect(screen.getByText("Username is required")).toBeTruthy();
      });

      expect(mockPush).not.toHaveBeenCalled();
    });

    it("shows 'Username must be at least 3 characters' error for short username", async () => {
      render(<RegisterCredentials />);

      const usernameInput = screen.getByPlaceholderText("Username");
      fireEvent.changeText(usernameInput, "ab");

      const continueButton = screen.getByText("Continue");
      fireEvent.press(continueButton);

      await waitFor(() => {
        expect(screen.getByText("Username must be at least 3 characters")).toBeTruthy();
      });

      expect(mockPush).not.toHaveBeenCalled();
    });

    it("shows real-time validation error when username is less than 3 characters", async () => {
      render(<RegisterCredentials />);

      const usernameInput = screen.getByPlaceholderText("Username");
      fireEvent.changeText(usernameInput, "ab");

      await waitFor(() => {
        expect(screen.getByText("Username must be at least 3 characters")).toBeTruthy();
      });
    });

    it("clears username error when username becomes valid", async () => {
      render(<RegisterCredentials />);

      const usernameInput = screen.getByPlaceholderText("Username");
      fireEvent.changeText(usernameInput, "ab");

      await waitFor(() => {
        expect(screen.getByText("Username must be at least 3 characters")).toBeTruthy();
      });

      fireEvent.changeText(usernameInput, "abc");

      await waitFor(() => {
        expect(screen.queryByText("Username must be at least 3 characters")).toBeNull();
      });
    });
  });

  describe("Username availability debounce and announcements", () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.runOnlyPendingTimers();
      jest.useRealTimers();
    });

    it("debounces availability checks and only requests the latest username", async () => {
      render(<RegisterCredentials />);
      const usernameInput = screen.getByPlaceholderText("Username");

      fireEvent.changeText(usernameInput, "abc");

      await act(async () => {
        jest.advanceTimersByTime(400);
      });

      expect(mockCheckUsernameAvailability).not.toHaveBeenCalled();

      fireEvent.changeText(usernameInput, "abcd");

      await act(async () => {
        jest.advanceTimersByTime(500);
        await Promise.resolve();
      });

      expect(mockCheckUsernameAvailability).toHaveBeenCalledTimes(1);
      expect(mockCheckUsernameAvailability).toHaveBeenCalledWith("abcd");
    });

    it("announces username availability updates for screen readers", async () => {
      render(<RegisterCredentials />);
      const usernameInput = screen.getByPlaceholderText("Username");

      fireEvent.changeText(usernameInput, "strideuser");

      await act(async () => {
        jest.advanceTimersByTime(500);
        await Promise.resolve();
      });

      const announcement = screen.getByLabelText("Username is available");
      expect(announcement).toBeTruthy();
      expect(announcement.props.accessibilityLiveRegion).toBe("polite");
    });

    it("prevents submit via keyboard while username check is still pending", async () => {
      render(<RegisterCredentials />);
      fireEvent.changeText(screen.getByPlaceholderText("Username"), "strideuser");
      fireEvent.changeText(screen.getByPlaceholderText("Password"), "ValidPass123!");
      fireEvent.changeText(screen.getByPlaceholderText("Confirm Password"), "ValidPass123!");

      fireEvent(screen.getByPlaceholderText("Confirm Password"), "submitEditing");

      await waitFor(() => {
        expect(screen.getByText("Please wait while we verify username availability")).toBeTruthy();
      });
      expect(mockPush).not.toHaveBeenCalled();
    });

    it("prevents submit when username availability check returns an error", async () => {
      mockCheckUsernameAvailability.mockResolvedValueOnce({ available: false, error: true });

      render(<RegisterCredentials />);
      fireEvent.changeText(screen.getByPlaceholderText("Username"), "strideuser");
      fireEvent.changeText(screen.getByPlaceholderText("Password"), "ValidPass123!");
      fireEvent.changeText(screen.getByPlaceholderText("Confirm Password"), "ValidPass123!");

      await act(async () => {
        jest.advanceTimersByTime(500);
        await Promise.resolve();
      });

      fireEvent(screen.getByPlaceholderText("Confirm Password"), "submitEditing");

      await waitFor(() => {
        expect(screen.getAllByText("Unable to verify username availability right now").length).toBeGreaterThan(0);
      });
      expect(mockPush).not.toHaveBeenCalled();
    });
  });

  // --- Password requirements validation ---

  describe("Password requirements validation", () => {
    it("shows password requirements when password field has input", async () => {
      render(<RegisterCredentials />);

      const passwordInput = screen.getByPlaceholderText("Password");
      fireEvent.changeText(passwordInput, "test");

      await waitFor(() => {
        expect(screen.getByText("Password must contain:")).toBeTruthy();
        expect(screen.getByText("At least 8 characters")).toBeTruthy();
      });
    });

    it("shows all password requirements", async () => {
      render(<RegisterCredentials />);

      const passwordInput = screen.getByPlaceholderText("Password");
      fireEvent.changeText(passwordInput, "test");

      await waitFor(() => {
        expect(screen.getByText("At least 8 characters")).toBeTruthy();
        expect(screen.getByText("One uppercase letter")).toBeTruthy();
        expect(screen.getByText("One lowercase letter")).toBeTruthy();
        expect(screen.getByText("One number")).toBeTruthy();
        expect(screen.getByText("One special character")).toBeTruthy();
      });
    });

    it("shows 'Password is required' error when continuing with empty password", async () => {
      render(<RegisterCredentials />);

      const usernameInput = screen.getByPlaceholderText("Username");
      fireEvent.changeText(usernameInput, "testuser");

      const continueButton = screen.getByText("Continue");
      fireEvent.press(continueButton);

      await waitFor(() => {
        expect(screen.getByText("Password is required")).toBeTruthy();
      });

      expect(mockPush).not.toHaveBeenCalled();
    });

    it("shows error when password does not meet requirements", async () => {
      render(<RegisterCredentials />);

      const passwordInput = screen.getByPlaceholderText("Password");
      fireEvent.changeText(passwordInput, "short");

      await waitFor(() => {
        expect(screen.getByText("Password does not meet all requirements")).toBeTruthy();
      });
    });

    it("clears password error when password meets all requirements", async () => {
      render(<RegisterCredentials />);

      const passwordInput = screen.getByPlaceholderText("Password");
      fireEvent.changeText(passwordInput, "short");

      await waitFor(() => {
        expect(screen.getByText("Password does not meet all requirements")).toBeTruthy();
      });

      fireEvent.changeText(passwordInput, "ValidPass123!");

      await waitFor(() => {
        expect(screen.queryByText("Password does not meet all requirements")).toBeNull();
      });
    });
  });

  // --- Password matching validation ---

  describe("Password matching validation", () => {
    it("shows 'Password confirmation is required' error when continuing with empty confirm password", async () => {
      render(<RegisterCredentials />);

      const usernameInput = screen.getByPlaceholderText("Username");
      const passwordInput = screen.getByPlaceholderText("Password");

      fireEvent.changeText(usernameInput, "testuser");
      fireEvent.changeText(passwordInput, "ValidPass123!");

      const continueButton = screen.getByText("Continue");
      fireEvent.press(continueButton);

      await waitFor(() => {
        expect(screen.getByText("Password confirmation is required")).toBeTruthy();
      });

      expect(mockPush).not.toHaveBeenCalled();
    });

    it.skip("shows 'Passwords do not match' error when passwords don't match", async () => {
      render(<RegisterCredentials />);

      const passwordInput = screen.getByPlaceholderText("Password");
      const passwordConfirmInput = screen.getByPlaceholderText("Confirm Password");

      // Set password first
      fireEvent.changeText(passwordInput, "ValidPass123!");
      // Wait a moment for state to update
      await new Promise((resolve) => setTimeout(resolve, 50));
      
      // Set a different confirm password
      fireEvent.changeText(passwordConfirmInput, "DifferentPass123!");

      // The indicator should show "Passwords do not match" when passwordConfirm has text
      await waitFor(() => {
        const errorText = screen.queryByText("Passwords do not match");
        expect(errorText).toBeTruthy();
      }, { timeout: 2000 });
    });

    it("shows 'Passwords match' indicator when passwords match", async () => {
      render(<RegisterCredentials />);

      const passwordInput = screen.getByPlaceholderText("Password");
      const passwordConfirmInput = screen.getByPlaceholderText("Confirm Password");

      fireEvent.changeText(passwordInput, "ValidPass123!");
      fireEvent.changeText(passwordConfirmInput, "ValidPass123!");

      await waitFor(() => {
        expect(screen.getByText("Passwords match")).toBeTruthy();
      });
    });

    it.skip("updates password confirm error when password changes", async () => {
      render(<RegisterCredentials />);

      const passwordInput = screen.getByPlaceholderText("Password");
      const passwordConfirmInput = screen.getByPlaceholderText("Confirm Password");

      // Set matching passwords
      fireEvent.changeText(passwordInput, "ValidPass123!");
      await new Promise((resolve) => setTimeout(resolve, 50));
      fireEvent.changeText(passwordConfirmInput, "ValidPass123!");

      await waitFor(() => {
        expect(screen.getByText("Passwords match")).toBeTruthy();
      }, { timeout: 2000 });

      // Change password to make them not match
      fireEvent.changeText(passwordInput, "DifferentPass123!");

      await waitFor(() => {
        const errorText = screen.queryByText("Passwords do not match");
        expect(errorText).toBeTruthy();
      }, { timeout: 2000 });
    });
  });

  // --- Password visibility toggles ---

  describe("Password visibility", () => {
    it("toggles password visibility when eye icon is pressed", () => {
      render(<RegisterCredentials />);

      const passwordInput = screen.getByPlaceholderText("Password");
      const showPasswordButton = screen.getByLabelText("Show password");

      // Initially password should be hidden
      expect(passwordInput.props.secureTextEntry).toBe(true);

      // Press show password button
      fireEvent.press(showPasswordButton);

      // Password should now be visible
      expect(passwordInput.props.secureTextEntry).toBe(false);
      expect(screen.getByLabelText("Hide password")).toBeTruthy();
    });

    it("toggles password confirm visibility when eye icon is pressed", () => {
      render(<RegisterCredentials />);

      const passwordConfirmInput = screen.getByPlaceholderText("Confirm Password");
      const showPasswordConfirmButton = screen.getByLabelText("Show password confirmation");

      // Initially password should be hidden
      expect(passwordConfirmInput.props.secureTextEntry).toBe(true);

      // Press show password button
      fireEvent.press(showPasswordConfirmButton);

      // Password should now be visible
      expect(passwordConfirmInput.props.secureTextEntry).toBe(false);
      expect(screen.getByLabelText("Hide password confirmation")).toBeTruthy();
    });
  });

  // --- Navigation ---

  describe("Navigation", () => {
    it("navigates to register-contact with all form data when form is valid", async () => {
      render(<RegisterCredentials />);

      const usernameInput = screen.getByPlaceholderText("Username");
      const passwordInput = screen.getByPlaceholderText("Password");
      const passwordConfirmInput = screen.getByPlaceholderText("Confirm Password");

      fireEvent.changeText(usernameInput, "  testuser  ");
      fireEvent.changeText(passwordInput, "  ValidPass123!  ");
      fireEvent.changeText(passwordConfirmInput, "  ValidPass123!  ");
      await waitForUsernameAvailabilityCheck("testuser");

      const continueButton = screen.getByText("Continue");
      fireEvent.press(continueButton);

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalled();
      });

      expect(mockPush).toHaveBeenCalledWith({
        pathname: "/register-contact",
        params: {
          firstName: "John",
          lastName: "Doe",
          username: "testuser",
          password: "ValidPass123!",
        },
      });
    });

    it("does not navigate when validation fails", async () => {
      render(<RegisterCredentials />);

      const continueButton = screen.getByText("Continue");
      fireEvent.press(continueButton);

      await waitFor(() => {
        expect(screen.getByText("Username is required")).toBeTruthy();
      });

      expect(mockPush).not.toHaveBeenCalled();
    });

    it("calls router.back() when 'Back' is pressed", () => {
      render(<RegisterCredentials />);

      const backButton = screen.getByText("Back");
      fireEvent.press(backButton);

      expect(mockBack).toHaveBeenCalledTimes(1);
    });
  });

  // --- Missing params handling ---

  describe("Missing params handling", () => {
    it("shows alert and redirects to register when firstName is missing", async () => {
      mockParams = { lastName: "Doe" };

      render(<RegisterCredentials />);

      const usernameInput = screen.getByPlaceholderText("Username");
      const passwordInput = screen.getByPlaceholderText("Password");
      const passwordConfirmInput = screen.getByPlaceholderText("Confirm Password");

      fireEvent.changeText(usernameInput, "testuser");
      fireEvent.changeText(passwordInput, "ValidPass123!");
      fireEvent.changeText(passwordConfirmInput, "ValidPass123!");
      await waitForUsernameAvailabilityCheck("testuser");

      const continueButton = screen.getByText("Continue");
      fireEvent.press(continueButton);

      await waitFor(() => {
        expect(alertSpy).toHaveBeenCalledWith("Error", "Missing required information. Please start over.");
      });

      expect(mockReplace).toHaveBeenCalledWith("/register");
    });

    it("shows alert and redirects to register when lastName is missing", async () => {
      mockParams = { firstName: "John" };

      render(<RegisterCredentials />);

      const usernameInput = screen.getByPlaceholderText("Username");
      const passwordInput = screen.getByPlaceholderText("Password");
      const passwordConfirmInput = screen.getByPlaceholderText("Confirm Password");

      fireEvent.changeText(usernameInput, "testuser");
      fireEvent.changeText(passwordInput, "ValidPass123!");
      fireEvent.changeText(passwordConfirmInput, "ValidPass123!");
      await waitForUsernameAvailabilityCheck("testuser");

      const continueButton = screen.getByText("Continue");
      fireEvent.press(continueButton);

      await waitFor(() => {
        expect(alertSpy).toHaveBeenCalledWith("Error", "Missing required information. Please start over.");
      });

      expect(mockReplace).toHaveBeenCalledWith("/register");
    });
  });

  // --- Form validation edge cases ---

  describe("Form validation edge cases", () => {
    it("trims whitespace from username and password before navigation", async () => {
      render(<RegisterCredentials />);

      const usernameInput = screen.getByPlaceholderText("Username");
      const passwordInput = screen.getByPlaceholderText("Password");
      const passwordConfirmInput = screen.getByPlaceholderText("Confirm Password");

      fireEvent.changeText(usernameInput, "  testuser  ");
      fireEvent.changeText(passwordInput, "  ValidPass123!  ");
      fireEvent.changeText(passwordConfirmInput, "  ValidPass123!  ");
      await waitForUsernameAvailabilityCheck("testuser");

      const continueButton = screen.getByText("Continue");
      fireEvent.press(continueButton);

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalled();
      });

      const callArgs = mockPush.mock.calls[0][0];
      expect(callArgs.params.username).toBe("testuser");
      expect(callArgs.params.password).toBe("ValidPass123!");
    });

    it("clears previous errors when continuing again after fixing inputs", async () => {
      render(<RegisterCredentials />);

      // First, trigger validation errors
      const continueButton = screen.getByText("Continue");
      fireEvent.press(continueButton);

      await waitFor(() => {
        expect(screen.getByText("Username is required")).toBeTruthy();
      });

      // Now fill in the fields and continue
      const usernameInput = screen.getByPlaceholderText("Username");
      const passwordInput = screen.getByPlaceholderText("Password");
      const passwordConfirmInput = screen.getByPlaceholderText("Confirm Password");

      fireEvent.changeText(usernameInput, "testuser");
      fireEvent.changeText(passwordInput, "ValidPass123!");
      fireEvent.changeText(passwordConfirmInput, "ValidPass123!");
      await waitForUsernameAvailabilityCheck("testuser");

      fireEvent.press(continueButton);

      // Errors should be cleared and navigation should occur
      await waitFor(() => {
        expect(mockPush).toHaveBeenCalled();
      });

      expect(screen.queryByText("Username is required")).toBeNull();
    });
  });
});
