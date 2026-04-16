/**
 * Integration tests for registration screen Step 3 (app/(auth)/register-contact.tsx)
 * 
 * Tests the final step of registration including email validation,
 * API integration (register + auto-login), error handling, and navigation.
 */

import * as React from "react";
import { render, fireEvent, screen, waitFor, act } from "@testing-library/react-native";
import { Alert } from "react-native";
import RegisterContact from "../app/(auth)/register-contact";
import { register as apiRegister, login as apiLogin } from "../services/api";
import { useAuth } from "../contexts/AuthContext";

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

// Mock services/api
const mockApiRegister = jest.fn();
const mockApiLogin = jest.fn();
const mockCheckEmailAvailability = jest.fn();
jest.mock("../services/api", () => ({
  register: (...args: any[]) => mockApiRegister(...args),
  login: (...args: any[]) => mockApiLogin(...args),
  checkEmailAvailability: (...args: any[]) => mockCheckEmailAvailability(...args),
}));

// Mock AuthContext
const mockAuthLogin = jest.fn();
jest.mock("../contexts/AuthContext", () => ({
  useAuth: () => ({
    login: mockAuthLogin,
    isAuthenticated: false,
    isDevBypass: false,
    isLoading: false,
    logout: jest.fn(),
    refreshTokens: jest.fn(),
    devBypass: jest.fn(),
  }),
}));

// Mock Alert.alert
const alertSpy = jest.spyOn(Alert, "alert");

describe("Register Contact Screen Step 3 (app/(auth)/register-contact.tsx)", () => {
  const waitForEmailAvailabilityCheck = async (expectedEmail: string) => {
    await waitFor(() => {
      expect(mockCheckEmailAvailability).toHaveBeenCalledWith(expectedEmail);
    });
  };

  const mockLoginResponse = {
    accessToken: "access-123",
    idToken: "id-456",
    refreshToken: "refresh-789",
    expiresIn: 3600,
    tokenType: "Bearer",
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockParams = {
      firstName: "John",
      lastName: "Doe",
      username: "testuser",
      password: "ValidPass123!",
    };
    mockApiRegister.mockResolvedValue({ message: "Registration successful", username: "testuser" });
    mockApiLogin.mockResolvedValue(mockLoginResponse);
    mockCheckEmailAvailability.mockResolvedValue({ available: true, error: false });
    mockAuthLogin.mockResolvedValue(undefined);
    alertSpy.mockClear();
  });

  // --- Rendering ---

  describe("Rendering", () => {
    it("renders the 'Create your Stride account' heading", () => {
      render(<RegisterContact />);
      expect(screen.getByText(/Create your.*Stride.*account/)).toBeTruthy();
    });

    it("renders the 'Step 3 of 3: Email' label", () => {
      render(<RegisterContact />);
      expect(screen.getByText("Step 3 of 3: Email")).toBeTruthy();
    });

    it("renders the email text field", () => {
      render(<RegisterContact />);
      expect(screen.getByPlaceholderText("Email")).toBeTruthy();
    });

    it("renders the 'Create Account' button", () => {
      render(<RegisterContact />);
      expect(screen.getByText("Create Account")).toBeTruthy();
    });

    it("renders the 'Back' button", () => {
      render(<RegisterContact />);
      expect(screen.getByText("Back")).toBeTruthy();
    });
  });

  // --- Email validation ---

  describe("Email validation", () => {
    it("shows 'Email is required' when creating account with empty email", async () => {
      render(<RegisterContact />);

      const createAccountButton = screen.getByText("Create Account");
      fireEvent.press(createAccountButton);

      await waitFor(() => {
        expect(screen.getByText("Email is required")).toBeTruthy();
      });
      expect(mockApiRegister).not.toHaveBeenCalled();
    });

    it("shows 'Please enter a valid email address' error for invalid email", async () => {
      render(<RegisterContact />);

      const emailInput = screen.getByPlaceholderText("Email");
      fireEvent.changeText(emailInput, "invalid-email");
      fireEvent.press(screen.getByText("Create Account"));

      await waitFor(() => {
        expect(screen.getByText("Please enter a valid email address")).toBeTruthy();
      });

      expect(mockApiRegister).not.toHaveBeenCalled();
    });

    it("accepts valid email addresses", async () => {
      render(<RegisterContact />);

      const emailInput = screen.getByPlaceholderText("Email");
      fireEvent.changeText(emailInput, "test@example.com");
      await waitForEmailAvailabilityCheck("test@example.com");

      const createAccountButton = screen.getByText("Create Account");
      await act(async () => {
        fireEvent.press(createAccountButton);
        await waitFor(() => {
          expect(mockApiRegister).toHaveBeenCalled();
        });
      });

      expect(mockApiRegister).toHaveBeenCalledWith(
        expect.objectContaining({
          email: "test@example.com",
        })
      );
    });

    it("trims whitespace from email before validation", async () => {
      render(<RegisterContact />);

      const emailInput = screen.getByPlaceholderText("Email");
      fireEvent.changeText(emailInput, "  test@example.com  ");
      await waitForEmailAvailabilityCheck("test@example.com");

      const createAccountButton = screen.getByText("Create Account");
      await act(async () => {
        fireEvent.press(createAccountButton);
        await waitFor(() => {
          expect(mockApiRegister).toHaveBeenCalled();
        });
      });

      expect(mockApiRegister).toHaveBeenCalledWith(
        expect.objectContaining({
          email: "test@example.com",
        })
      );
    });
  });

  describe("Email availability debounce and announcements", () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.runOnlyPendingTimers();
      jest.useRealTimers();
    });

    it("only checks availability after a valid email has been stable for 500ms", async () => {
      render(<RegisterContact />);
      const emailInput = screen.getByPlaceholderText("Email");

      fireEvent.changeText(emailInput, "invalid-email");

      await act(async () => {
        jest.advanceTimersByTime(600);
      });

      expect(mockCheckEmailAvailability).not.toHaveBeenCalled();

      fireEvent.changeText(emailInput, "test@example.com");

      await act(async () => {
        jest.advanceTimersByTime(400);
      });
      expect(mockCheckEmailAvailability).not.toHaveBeenCalled();

      await act(async () => {
        jest.advanceTimersByTime(100);
        await Promise.resolve();
      });

      expect(mockCheckEmailAvailability).toHaveBeenCalledTimes(1);
      expect(mockCheckEmailAvailability).toHaveBeenCalledWith("test@example.com");
    });

    it("announces email availability updates for screen readers", async () => {
      mockCheckEmailAvailability.mockResolvedValueOnce({ available: false, error: false });

      render(<RegisterContact />);
      fireEvent.changeText(screen.getByPlaceholderText("Email"), "taken@example.com");

      await act(async () => {
        jest.advanceTimersByTime(500);
        await Promise.resolve();
      });

      const announcement = screen.getByLabelText("Email is already in use");
      expect(announcement).toBeTruthy();
      expect(announcement.props.accessibilityLiveRegion).toBe("polite");
    });

    it("prevents submit via keyboard while email check is pending", async () => {
      render(<RegisterContact />);
      fireEvent.changeText(screen.getByPlaceholderText("Email"), "test@example.com");

      fireEvent(screen.getByPlaceholderText("Email"), "submitEditing");

      await waitFor(() => {
        expect(screen.getByText("Please wait while we verify email availability")).toBeTruthy();
      });
      expect(mockApiRegister).not.toHaveBeenCalled();
    });

    it("prevents submit when email availability check fails", async () => {
      mockCheckEmailAvailability.mockResolvedValueOnce({ available: false, error: true });

      render(<RegisterContact />);
      fireEvent.changeText(screen.getByPlaceholderText("Email"), "test@example.com");

      await act(async () => {
        jest.advanceTimersByTime(500);
        await Promise.resolve();
      });

      fireEvent(screen.getByPlaceholderText("Email"), "submitEditing");

      await waitFor(() => {
        expect(screen.getAllByText("Unable to verify email availability right now").length).toBeGreaterThan(0);
      });
      expect(mockApiRegister).not.toHaveBeenCalled();
    });
  });

  // --- API integration ---

  describe("API integration", () => {
    it("calls register() API with email data", async () => {
      render(<RegisterContact />);
      fireEvent.changeText(screen.getByPlaceholderText("Email"), "test@example.com");
      await waitForEmailAvailabilityCheck("test@example.com");

      const createAccountButton = screen.getByText("Create Account");
      await act(async () => {
        fireEvent.press(createAccountButton);
        await waitFor(() => {
          expect(mockApiRegister).toHaveBeenCalled();
        });
      });

      expect(mockApiRegister).toHaveBeenCalledWith({
        username: "testuser",
        password: "ValidPass123!",
        passwordConfirm: "ValidPass123!",
        email: "test@example.com",
        firstName: "John",
        lastName: "Doe",
      });
    });

    it("calls login() API after successful registration", async () => {
      render(<RegisterContact />);
      fireEvent.changeText(screen.getByPlaceholderText("Email"), "test@example.com");
      await waitForEmailAvailabilityCheck("test@example.com");

      const createAccountButton = screen.getByText("Create Account");
      await act(async () => {
        fireEvent.press(createAccountButton);
        await waitFor(() => {
          expect(mockApiRegister).toHaveBeenCalled();
        });
        await waitFor(() => {
          expect(mockApiLogin).toHaveBeenCalled();
        });
      });

      expect(mockApiLogin).toHaveBeenCalledWith({
        username: "testuser",
        password: "ValidPass123!",
      });
    });

    it("calls authLogin() with tokens after successful login", async () => {
      render(<RegisterContact />);
      fireEvent.changeText(screen.getByPlaceholderText("Email"), "test@example.com");
      await waitForEmailAvailabilityCheck("test@example.com");

      const createAccountButton = screen.getByText("Create Account");
      await act(async () => {
        fireEvent.press(createAccountButton);
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

    it("navigates to /home after successful registration and login", async () => {
      render(<RegisterContact />);
      fireEvent.changeText(screen.getByPlaceholderText("Email"), "test@example.com");
      await waitForEmailAvailabilityCheck("test@example.com");

      const createAccountButton = screen.getByText("Create Account");
      await act(async () => {
        fireEvent.press(createAccountButton);
        await waitFor(() => {
          expect(mockReplace).toHaveBeenCalled();
        });
      });

      expect(mockReplace).toHaveBeenCalledWith("/home");
    });

    it("sets loading state while API calls are in progress", async () => {
      // Create a promise that we can control
      let resolveRegister: (value: any) => void;
      const registerPromise = new Promise((resolve) => {
        resolveRegister = resolve;
      });
      mockApiRegister.mockReturnValueOnce(registerPromise);

      const { UNSAFE_root } = render(<RegisterContact />);
      fireEvent.changeText(screen.getByPlaceholderText("Email"), "test@example.com");
      await waitForEmailAvailabilityCheck("test@example.com");

      const createAccountButton = screen.getByText("Create Account");
      fireEvent.press(createAccountButton);

      // Button should show loading state
      await waitFor(() => {
        const activityIndicators = UNSAFE_root.findAllByType(
          require("react-native").ActivityIndicator
        );
        expect(activityIndicators.length).toBeGreaterThan(0);
      }, { timeout: 2000 });

      // Resolve the promise
      await act(async () => {
        resolveRegister!({ message: "Registration successful", username: "testuser" });
        await registerPromise;
      });
    });
  });

  // --- Error handling ---

  describe("Error handling", () => {
    it("shows Alert.alert('Registration Failed', ...) when register API throws", async () => {
      const error = new Error("Registration failed");
      mockApiRegister.mockRejectedValueOnce(error);

      render(<RegisterContact />);
      fireEvent.changeText(screen.getByPlaceholderText("Email"), "test@example.com");
      await waitForEmailAvailabilityCheck("test@example.com");

      const createAccountButton = screen.getByText("Create Account");
      await act(async () => {
        fireEvent.press(createAccountButton);
        await waitFor(() => {
          expect(alertSpy).toHaveBeenCalled();
        });
      });

      expect(alertSpy).toHaveBeenCalledWith("Registration Failed", "Registration failed");
    });

    it("shows alert and navigates back when username is already taken", async () => {
      const error = new Error("Username already exists");
      mockApiRegister.mockRejectedValueOnce(error);

      render(<RegisterContact />);
      fireEvent.changeText(screen.getByPlaceholderText("Email"), "test@example.com");
      await waitForEmailAvailabilityCheck("test@example.com");

      const createAccountButton = screen.getByText("Create Account");
      await act(async () => {
        fireEvent.press(createAccountButton);
      });

      // Wait for the "Username Taken" alert (the second one)
      await waitFor(() => {
        expect(alertSpy).toHaveBeenCalled();
        const usernameTakenCall = alertSpy.mock.calls.find(
          (call) => call[0] === "Username Taken"
        );
        expect(usernameTakenCall).toBeTruthy();
      }, { timeout: 2000 });

      // Get the OK button from the "Username Taken" alert and press it
      const alertCall = alertSpy.mock.calls.find(
        (call) => call[0] === "Username Taken"
      );
      if (alertCall && alertCall[2]) {
        const buttons = alertCall[2] as Array<{ text: string; onPress: () => void }>;
        const okButton = buttons.find((btn) => btn.text === "OK");
        if (okButton) {
          act(() => {
            okButton.onPress();
          });
        }
      }

      expect(mockBack).toHaveBeenCalled();
    });

    it("sets email error when email is already taken", async () => {
      const error = new Error("This email is already registered");
      mockApiRegister.mockRejectedValueOnce(error);

      render(<RegisterContact />);
      const emailInput = screen.getByPlaceholderText("Email");
      fireEvent.changeText(emailInput, "test@example.com");
      await waitForEmailAvailabilityCheck("test@example.com");

      const createAccountButton = screen.getByText("Create Account");
      await act(async () => {
        fireEvent.press(createAccountButton);
      });

      await waitFor(() => {
        expect(screen.getByText("An account with this email already exists")).toBeTruthy();
      }, { timeout: 2000 });
    });

    it("treats generic 'already exists' errors as email conflicts", async () => {
      mockApiRegister.mockRejectedValueOnce(new Error("User already exists"));

      render(<RegisterContact />);
      fireEvent.changeText(screen.getByPlaceholderText("Email"), "test@example.com");
      await waitForEmailAvailabilityCheck("test@example.com");

      fireEvent.press(screen.getByText("Create Account"));

      await waitFor(() => {
        expect(screen.getByText("An account with this email already exists")).toBeTruthy();
      });
    });

    it("shows alert and navigates back when password error occurs", async () => {
      const error = new Error("Password does not meet requirements");
      mockApiRegister.mockRejectedValueOnce(error);

      render(<RegisterContact />);
      fireEvent.changeText(screen.getByPlaceholderText("Email"), "test@example.com");
      await waitForEmailAvailabilityCheck("test@example.com");

      const createAccountButton = screen.getByText("Create Account");
      await act(async () => {
        fireEvent.press(createAccountButton);
      });

      // Wait for the "Password Error" alert (the second one)
      await waitFor(() => {
        expect(alertSpy).toHaveBeenCalled();
        const passwordErrorCall = alertSpy.mock.calls.find(
          (call) => call[0] === "Password Error"
        );
        expect(passwordErrorCall).toBeTruthy();
      }, { timeout: 2000 });

      // Get the OK button from the "Password Error" alert and press it
      const alertCall = alertSpy.mock.calls.find(
        (call) => call[0] === "Password Error"
      );
      if (alertCall && alertCall[2]) {
        const buttons = alertCall[2] as Array<{ text: string; onPress: () => void }>;
        const okButton = buttons.find((btn) => btn.text === "OK");
        if (okButton) {
          act(() => {
            okButton.onPress();
          });
        }
      }

      expect(mockBack).toHaveBeenCalled();
    });

    it("shows alert and redirects to login when auto-login fails after registration", async () => {
      mockApiRegister.mockResolvedValueOnce({ message: "Registration successful", username: "testuser" });
      const loginError = new Error("Login failed");
      mockApiLogin.mockRejectedValueOnce(loginError);

      render(<RegisterContact />);
      fireEvent.changeText(screen.getByPlaceholderText("Email"), "test@example.com");
      await waitForEmailAvailabilityCheck("test@example.com");

      const createAccountButton = screen.getByText("Create Account");
      await act(async () => {
        fireEvent.press(createAccountButton);
      });

      await waitFor(() => {
        expect(alertSpy).toHaveBeenCalled();
        // Check that the alert was called with "Registration Successful" and the message contains "Please sign in"
        const registrationAlertCall = alertSpy.mock.calls.find(
          (call) => call[0] === "Registration Successful"
        );
        expect(registrationAlertCall).toBeTruthy();
        expect(registrationAlertCall![1]).toContain("Please sign in");
      }, { timeout: 2000 });

      // Get the OK button from the alert
      const alertCall = alertSpy.mock.calls.find(
        (call) => call[0] === "Registration Successful"
      );
      if (alertCall && alertCall[2]) {
        const buttons = alertCall[2] as Array<{ text: string; onPress: () => void }>;
        const okButton = buttons.find((btn) => btn.text === "OK");
        if (okButton) {
          act(() => {
            okButton.onPress();
          });
          expect(mockReplace).toHaveBeenCalledWith("/");
        }
      }
    });
  });

  // --- Missing params handling ---

  describe("Missing params handling", () => {
    it("shows alert and redirects to register when params are missing", async () => {
      mockParams = {};

      render(<RegisterContact />);
      fireEvent.changeText(screen.getByPlaceholderText("Email"), "test@example.com");
      await waitForEmailAvailabilityCheck("test@example.com");

      const createAccountButton = screen.getByText("Create Account");
      fireEvent.press(createAccountButton);

      await waitFor(() => {
        expect(alertSpy).toHaveBeenCalledWith("Error", "Missing required information. Please start over.");
      });

      expect(mockReplace).toHaveBeenCalledWith("/register");
    });
  });

  // --- Navigation ---

  describe("Navigation", () => {
    it("calls router.back() when 'Back' is pressed", () => {
      render(<RegisterContact />);

      const backButton = screen.getByText("Back");
      fireEvent.press(backButton);

      expect(mockBack).toHaveBeenCalledTimes(1);
    });
  });
});
