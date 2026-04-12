/**
 * Integration tests for registration screen Step 3 (app/(auth)/register-contact.tsx)
 * 
 * Tests the final step of registration including email/phone validation,
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
jest.mock("../services/api", () => ({
  register: (...args: any[]) => mockApiRegister(...args),
  login: (...args: any[]) => mockApiLogin(...args),
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

// Mock libphonenumber-js
jest.mock("libphonenumber-js", () => ({
  parsePhoneNumber: jest.fn((phone, country) => {
    // Simple mock - return valid phone number for 10-digit US numbers
    const digits = phone.replace(/\D/g, "");
    if (digits.length === 10) {
      return {
        isValid: () => true,
        number: `+1${digits}`,
      };
    }
    if (digits.length === 11 && digits.startsWith("1")) {
      return {
        isValid: () => true,
        number: `+${digits}`,
      };
    }
    return {
      isValid: () => false,
      number: null,
    };
  }),
  AsYouType: jest.fn().mockImplementation((country) => {
    return {
      input: (digits: string) => {
        // Simple formatting: (XXX) XXX-XXXX for 10 digits
        const cleaned = digits.replace(/\D/g, "");
        if (cleaned.length <= 3) return cleaned;
        if (cleaned.length <= 6) return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3)}`;
        return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6, 10)}`;
      },
    };
  }),
}));

// Mock Alert.alert
const alertSpy = jest.spyOn(Alert, "alert");

describe("Register Contact Screen Step 3 (app/(auth)/register-contact.tsx)", () => {
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
    mockAuthLogin.mockResolvedValue(undefined);
    alertSpy.mockClear();
  });

  // --- Rendering ---

  describe("Rendering", () => {
    it("renders the 'Create your Stride account' heading", () => {
      render(<RegisterContact />);
      expect(screen.getByText(/Create your.*Stride.*account/)).toBeTruthy();
    });

    it("renders the 'Step 3 of 3: Contact' label", () => {
      render(<RegisterContact />);
      expect(screen.getByText("Step 3 of 3: Contact")).toBeTruthy();
    });

    it("does not render the email text field by default", () => {
      render(<RegisterContact />);
      expect(screen.queryByPlaceholderText("Email")).toBeNull();
    });

    it("renders the phone number text field", () => {
      render(<RegisterContact />);
      expect(screen.getByPlaceholderText("Phone Number")).toBeTruthy();
    });

    it("defaults to phone mode with email toggle text", () => {
      render(<RegisterContact />);
      expect(screen.getByText("Use email instead")).toBeTruthy();
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

  describe("Contact mode toggle", () => {
    it("toggles from phone mode to email mode", () => {
      render(<RegisterContact />);

      fireEvent.press(screen.getByText("Use email instead"));
      expect(screen.getByText("Use phone instead")).toBeTruthy();
      expect(screen.getByPlaceholderText("Email")).toBeTruthy();
      expect(screen.queryByPlaceholderText("Phone Number")).toBeNull();
    });
  });

  // --- Email validation ---

  describe("Email validation", () => {
    it("does not require email in default phone mode", async () => {
      render(<RegisterContact />);

      const phoneInput = screen.getByPlaceholderText("Phone Number");
      fireEvent.changeText(phoneInput, "8122949840");
      const createAccountButton = screen.getByText("Create Account");
      await act(async () => {
        fireEvent.press(createAccountButton);
        await waitFor(() => {
          expect(mockApiRegister).toHaveBeenCalled();
        });
      });

      expect(mockApiRegister).toHaveBeenCalledWith(
        expect.not.objectContaining({
          email: expect.any(String),
        })
      );
    });

    it("shows 'Email is required' in email mode when creating account with empty email", async () => {
      render(<RegisterContact />);
      fireEvent.press(screen.getByText("Use email instead"));

      const createAccountButton = screen.getByText("Create Account");
      fireEvent.press(createAccountButton);

      await waitFor(() => {
        expect(screen.getByText("Email is required")).toBeTruthy();
      });
      expect(mockApiRegister).not.toHaveBeenCalled();
    });

    it("shows 'Please enter a valid email address' error for invalid email in email mode", async () => {
      render(<RegisterContact />);
      fireEvent.press(screen.getByText("Use email instead"));

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
      fireEvent.press(screen.getByText("Use email instead"));

      const emailInput = screen.getByPlaceholderText("Email");
      fireEvent.changeText(emailInput, "test@example.com");

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
      fireEvent.press(screen.getByText("Use email instead"));

      const emailInput = screen.getByPlaceholderText("Email");
      fireEvent.changeText(emailInput, "  test@example.com  ");

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

  // --- Phone number validation ---

  describe("Phone number validation", () => {
    it("shows 'Phone number is required' error when creating account with empty phone", async () => {
      render(<RegisterContact />);

      const createAccountButton = screen.getByText("Create Account");
      fireEvent.press(createAccountButton);

      await waitFor(() => {
        expect(screen.getByText("Phone number is required")).toBeTruthy();
      });

      expect(mockApiRegister).not.toHaveBeenCalled();
    });

    it("shows 'Please enter a valid phone number' error for invalid phone", async () => {
      render(<RegisterContact />);
      const phoneInput = screen.getByPlaceholderText("Phone Number");
      fireEvent.changeText(phoneInput, "123");

      const createAccountButton = screen.getByText("Create Account");
      fireEvent.press(createAccountButton);

      await waitFor(() => {
        expect(screen.getByText("Please enter a valid phone number")).toBeTruthy();
      });

      expect(mockApiRegister).not.toHaveBeenCalled();
    });

    it("does not require phone in email mode", async () => {
      render(<RegisterContact />);

      fireEvent.press(screen.getByText("Use email instead"));
      fireEvent.changeText(screen.getByPlaceholderText("Email"), "test@example.com");

      const createAccountButton = screen.getByText("Create Account");
      await act(async () => {
        fireEvent.press(createAccountButton);
        await waitFor(() => {
          expect(mockApiRegister).toHaveBeenCalled();
        });
      });

      expect(mockApiRegister).toHaveBeenCalledWith(
        expect.not.objectContaining({
          phoneNumber: expect.any(String),
        })
      );
    });

    it("formats phone number as user types", () => {
      render(<RegisterContact />);

      const phoneInput = screen.getByPlaceholderText("Phone Number");
      fireEvent.changeText(phoneInput, "8122949840");

      // Phone should be formatted
      expect(phoneInput.props.value).toBe("(812) 294-9840");
    });

    it("accepts valid phone numbers", async () => {
      render(<RegisterContact />);
      const phoneInput = screen.getByPlaceholderText("Phone Number");
      fireEvent.changeText(phoneInput, "8122949840");

      const createAccountButton = screen.getByText("Create Account");
      await act(async () => {
        fireEvent.press(createAccountButton);
        await waitFor(() => {
          expect(mockApiRegister).toHaveBeenCalled();
        });
      });

      // Phone should be converted to E.164 format
      expect(mockApiRegister).toHaveBeenCalledWith(
        expect.objectContaining({
          phoneNumber: "+18122949840",
        })
      );
    });
  });

  // --- API integration ---

  describe("API integration", () => {
    it("calls register() API with phone-only data in default mode", async () => {
      render(<RegisterContact />);
      const phoneInput = screen.getByPlaceholderText("Phone Number");
      fireEvent.changeText(phoneInput, "8122949840");

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
        phoneNumber: "+18122949840",
        firstName: "John",
        lastName: "Doe",
      });
    });

    it("calls register() API with email-only data in email mode", async () => {
      render(<RegisterContact />);
      fireEvent.press(screen.getByText("Use email instead"));
      fireEvent.changeText(screen.getByPlaceholderText("Email"), "test@example.com");

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
      const phoneInput = screen.getByPlaceholderText("Phone Number");
      fireEvent.changeText(phoneInput, "8122949840");

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
      const phoneInput = screen.getByPlaceholderText("Phone Number");
      fireEvent.changeText(phoneInput, "8122949840");

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
      const phoneInput = screen.getByPlaceholderText("Phone Number");
      fireEvent.changeText(phoneInput, "8122949840");

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
      const phoneInput = screen.getByPlaceholderText("Phone Number");
      fireEvent.changeText(phoneInput, "8122949840");

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
      const phoneInput = screen.getByPlaceholderText("Phone Number");
      fireEvent.changeText(phoneInput, "8122949840");

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
      const phoneInput = screen.getByPlaceholderText("Phone Number");
      fireEvent.changeText(phoneInput, "8122949840");

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
      // Use error message that contains "email" to match email error condition
      // Note: The code checks "username" || "already exists" first, so we need to avoid "already exists"
      const error = new Error("This email is already registered");
      mockApiRegister.mockRejectedValueOnce(error);

      render(<RegisterContact />);
      fireEvent.press(screen.getByText("Use email instead"));
      const emailInput = screen.getByPlaceholderText("Email");
      fireEvent.changeText(emailInput, "test@example.com");

      const createAccountButton = screen.getByText("Create Account");
      await act(async () => {
        fireEvent.press(createAccountButton);
      });

      await waitFor(() => {
        expect(screen.getByText("An account with this email already exists")).toBeTruthy();
      }, { timeout: 2000 });
    });

    it("sets phone error when phone is already taken", async () => {
      // Use error message that contains "phone" to match phone error condition
      // Note: The code checks "username" || "already exists" first, so we need to avoid "already exists"
      const error = new Error("This phone number is already registered");
      mockApiRegister.mockRejectedValueOnce(error);

      render(<RegisterContact />);
      const phoneInput = screen.getByPlaceholderText("Phone Number");
      fireEvent.changeText(phoneInput, "8122949840");

      const createAccountButton = screen.getByText("Create Account");
      await act(async () => {
        fireEvent.press(createAccountButton);
      });

      await waitFor(() => {
        expect(screen.getByText("An account with this phone number already exists")).toBeTruthy();
      }, { timeout: 2000 });
    });

    it("shows alert and navigates back when password error occurs", async () => {
      const error = new Error("Password does not meet requirements");
      mockApiRegister.mockRejectedValueOnce(error);

      render(<RegisterContact />);
      const phoneInput = screen.getByPlaceholderText("Phone Number");
      fireEvent.changeText(phoneInput, "8122949840");

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
      const phoneInput = screen.getByPlaceholderText("Phone Number");
      fireEvent.changeText(phoneInput, "8122949840");

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
      const phoneInput = screen.getByPlaceholderText("Phone Number");
      fireEvent.changeText(phoneInput, "8122949840");

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
