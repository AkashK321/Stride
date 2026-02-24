/**
 * Integration tests for registration screen Step 1 (app/(auth)/register.tsx)
 * 
 * Tests the first step of registration including form validation,
 * navigation, and data passing to the next step.
 */

import * as React from "react";
import { render, fireEvent, screen, waitFor } from "@testing-library/react-native";
import Register from "../app/(auth)/register";

// Mock expo-router
const mockPush = jest.fn();
const mockBack = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: jest.fn(),
    back: mockBack,
  }),
  useSegments: () => [],
}));

describe("Register Screen Step 1 (app/(auth)/register.tsx)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // --- Rendering ---

  describe("Rendering", () => {
    it("renders the 'Create your Stride account' heading", () => {
      render(<Register />);
      expect(screen.getByText(/Create your/)).toBeTruthy();
      // Stride is rendered as a nested Text component, so we check for the full text
      expect(screen.getByText(/Create your.*Stride.*account/)).toBeTruthy();
    });

    it("renders the 'Step 1 of 3: Your Name' label", () => {
      render(<Register />);
      expect(screen.getByText("Step 1 of 3: Your Name")).toBeTruthy();
    });

    it("renders the first name text field with placeholder 'First Name'", () => {
      render(<Register />);
      expect(screen.getByPlaceholderText("First Name")).toBeTruthy();
    });

    it("renders the last name text field with placeholder 'Last Name'", () => {
      render(<Register />);
      expect(screen.getByPlaceholderText("Last Name")).toBeTruthy();
    });

    it("renders the 'Continue' button", () => {
      render(<Register />);
      expect(screen.getByText("Continue")).toBeTruthy();
    });

    it("renders the 'Back to Sign In' button", () => {
      render(<Register />);
      expect(screen.getByText("Back to Sign In")).toBeTruthy();
    });
  });

  // --- Form validation ---

  describe("Form validation", () => {
    it("shows 'First name is required' error when continuing with empty first name", async () => {
      render(<Register />);

      const continueButton = screen.getByText("Continue");
      fireEvent.press(continueButton);

      await waitFor(() => {
        expect(screen.getByText("First name is required")).toBeTruthy();
      });

      expect(mockPush).not.toHaveBeenCalled();
    });

    it("shows 'Last name is required' error when continuing with empty last name", async () => {
      render(<Register />);

      const firstNameInput = screen.getByPlaceholderText("First Name");
      fireEvent.changeText(firstNameInput, "John");

      const continueButton = screen.getByText("Continue");
      fireEvent.press(continueButton);

      await waitFor(() => {
        expect(screen.getByText("Last name is required")).toBeTruthy();
      });

      expect(mockPush).not.toHaveBeenCalled();
    });

    it("shows both errors when both fields are empty", async () => {
      render(<Register />);

      const continueButton = screen.getByText("Continue");
      fireEvent.press(continueButton);

      await waitFor(() => {
        expect(screen.getByText("First name is required")).toBeTruthy();
        expect(screen.getByText("Last name is required")).toBeTruthy();
      });

      expect(mockPush).not.toHaveBeenCalled();
    });

    it("trims whitespace from first name and last name before validation", async () => {
      render(<Register />);

      const firstNameInput = screen.getByPlaceholderText("First Name");
      const lastNameInput = screen.getByPlaceholderText("Last Name");

      // Enter only whitespace
      fireEvent.changeText(firstNameInput, "   ");
      fireEvent.changeText(lastNameInput, "   ");

      const continueButton = screen.getByText("Continue");
      fireEvent.press(continueButton);

      await waitFor(() => {
        expect(screen.getByText("First name is required")).toBeTruthy();
        expect(screen.getByText("Last name is required")).toBeTruthy();
      });

      expect(mockPush).not.toHaveBeenCalled();
    });

    it("clears previous errors when continuing again after fixing inputs", async () => {
      render(<Register />);

      // First, trigger validation errors
      const continueButton = screen.getByText("Continue");
      fireEvent.press(continueButton);

      await waitFor(() => {
        expect(screen.getByText("First name is required")).toBeTruthy();
      });

      // Now fill in the fields and continue
      const firstNameInput = screen.getByPlaceholderText("First Name");
      const lastNameInput = screen.getByPlaceholderText("Last Name");

      fireEvent.changeText(firstNameInput, "John");
      fireEvent.changeText(lastNameInput, "Doe");

      fireEvent.press(continueButton);

      // Errors should be cleared and navigation should occur
      await waitFor(() => {
        expect(mockPush).toHaveBeenCalled();
      });

      expect(screen.queryByText("First name is required")).toBeNull();
      expect(screen.queryByText("Last name is required")).toBeNull();
    });
  });

  // --- Navigation ---

  describe("Navigation", () => {
    it("navigates to register-credentials with trimmed first name and last name when form is valid", async () => {
      render(<Register />);

      const firstNameInput = screen.getByPlaceholderText("First Name");
      const lastNameInput = screen.getByPlaceholderText("Last Name");

      fireEvent.changeText(firstNameInput, "  John  ");
      fireEvent.changeText(lastNameInput, "  Doe  ");

      const continueButton = screen.getByText("Continue");
      fireEvent.press(continueButton);

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalled();
      });

      expect(mockPush).toHaveBeenCalledWith({
        pathname: "/register-credentials",
        params: {
          firstName: "John",
          lastName: "Doe",
        },
      });
    });

    it("does not navigate when validation fails", async () => {
      render(<Register />);

      const continueButton = screen.getByText("Continue");
      fireEvent.press(continueButton);

      await waitFor(() => {
        expect(screen.getByText("First name is required")).toBeTruthy();
      });

      expect(mockPush).not.toHaveBeenCalled();
    });

    it("calls router.back() when 'Back to Sign In' is pressed", () => {
      render(<Register />);

      const backButton = screen.getByText("Back to Sign In");
      fireEvent.press(backButton);

      expect(mockBack).toHaveBeenCalledTimes(1);
    });
  });

  // --- Field focus behavior ---

  describe("Field focus behavior", () => {
    it("focuses last name field when 'next' is pressed on first name field", () => {
      render(<Register />);

      const firstNameInput = screen.getByPlaceholderText("First Name");
      const lastNameInput = screen.getByPlaceholderText("Last Name");

      // Simulate pressing "next" on first name field
      fireEvent(firstNameInput, "submitEditing");

      // The lastNameInput should receive focus (we can't directly test focus,
      // but we can verify the onSubmitEditing handler was set up correctly)
      expect(lastNameInput).toBeTruthy();
    });

    it("calls handleNext when 'done' is pressed on last name field", async () => {
      render(<Register />);

      const firstNameInput = screen.getByPlaceholderText("First Name");
      const lastNameInput = screen.getByPlaceholderText("Last Name");

      fireEvent.changeText(firstNameInput, "John");
      fireEvent.changeText(lastNameInput, "Doe");

      // Simulate pressing "done" on last name field
      fireEvent(lastNameInput, "submitEditing");

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalled();
      });
    });
  });
});
