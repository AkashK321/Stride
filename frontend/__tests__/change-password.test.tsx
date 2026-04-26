import * as React from "react";
import { Alert } from "react-native";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import ChangePasswordScreen from "../app/(tabs)/profile/change-password";

const mockBack = jest.fn();
const mockChangePassword = jest.fn();
const mockLogout = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({
    back: mockBack,
  }),
  useSegments: () => [],
}));

jest.mock("../services/api", () => ({
  changePassword: (...args: any[]) => mockChangePassword(...args),
}));

jest.mock("../contexts/AuthContext", () => ({
  useAuth: () => ({
    logout: mockLogout,
  }),
}));

const alertSpy = jest.spyOn(Alert, "alert");

describe("Change Password Screen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders key form fields and actions", () => {
    render(<ChangePasswordScreen />);

    expect(screen.getByText("Change Password")).toBeTruthy();
    expect(screen.getByPlaceholderText("Current Password")).toBeTruthy();
    expect(screen.getByPlaceholderText("New Password")).toBeTruthy();
    expect(screen.getByPlaceholderText("Confirm New Password")).toBeTruthy();
    expect(screen.getByText("Save Password")).toBeTruthy();
    expect(screen.getByText("Cancel")).toBeTruthy();
  });

  it("shows validation errors when submitting empty form", async () => {
    render(<ChangePasswordScreen />);

    fireEvent.press(screen.getByText("Save Password"));

    await waitFor(() => {
      expect(screen.getByText("Current password is required")).toBeTruthy();
      expect(screen.getByText("New password is required")).toBeTruthy();
      expect(screen.getByText("Password confirmation is required")).toBeTruthy();
    });

    expect(mockChangePassword).not.toHaveBeenCalled();
  });

  it("submits valid payload and navigates back after success", async () => {
    mockChangePassword.mockResolvedValueOnce({
      message: "Password changed successfully",
    });

    render(<ChangePasswordScreen />);

    fireEvent.changeText(screen.getByPlaceholderText("Current Password"), "OldPass123!");
    fireEvent.changeText(screen.getByPlaceholderText("New Password"), "NewPass123!");
    fireEvent.changeText(screen.getByPlaceholderText("Confirm New Password"), "NewPass123!");
    fireEvent.press(screen.getByText("Save Password"));

    await waitFor(() => {
      expect(mockChangePassword).toHaveBeenCalledWith({
        currentPassword: "OldPass123!",
        newPassword: "NewPass123!",
        newPasswordConfirm: "NewPass123!",
      });
    });

    expect(alertSpy).toHaveBeenCalledWith("Success", "Password changed successfully", [
      { text: "OK", onPress: expect.any(Function) },
    ]);

    const okAction = alertSpy.mock.calls[0][2]?.[0];
    if (okAction && okAction.onPress) {
      okAction.onPress();
    }
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it("logs out when API indicates session expiry", async () => {
    mockChangePassword.mockRejectedValueOnce(
      new Error("Your session has expired. Please log in again.")
    );

    render(<ChangePasswordScreen />);

    fireEvent.changeText(screen.getByPlaceholderText("Current Password"), "OldPass123!");
    fireEvent.changeText(screen.getByPlaceholderText("New Password"), "NewPass123!");
    fireEvent.changeText(screen.getByPlaceholderText("Confirm New Password"), "NewPass123!");
    fireEvent.press(screen.getByText("Save Password"));

    await waitFor(() => {
      expect(mockLogout).toHaveBeenCalledTimes(1);
    });

    expect(alertSpy).toHaveBeenCalledWith("Session expired", "Please log in again.");
  });
});
