import * as React from "react";
import { render, fireEvent, screen, waitFor, act } from "@testing-library/react-native";
import { Alert } from "react-native";
import VerifyScreen from "../app/(auth)/verify";

const mockReplace = jest.fn();
let mockParams: Record<string, string> = {};

jest.mock("expo-router", () => ({
  useRouter: () => ({
    replace: mockReplace,
    push: jest.fn(),
    back: jest.fn(),
  }),
  useLocalSearchParams: () => mockParams,
}));

const mockConfirmSignUp = jest.fn();
const mockResendSignUpCode = jest.fn();
jest.mock("../services/api", () => ({
  confirmSignUp: (...args: any[]) => mockConfirmSignUp(...args),
  resendSignUpCode: (...args: any[]) => mockResendSignUpCode(...args),
}));

const alertSpy = jest.spyOn(Alert, "alert");

describe("Verify screen (app/(auth)/verify.tsx)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParams = { username: "testuser" };
    mockConfirmSignUp.mockResolvedValue({ message: "Account verified successfully" });
    mockResendSignUpCode.mockResolvedValue({ message: "Verification code sent successfully" });
  });

  it("prefills username from query params", () => {
    render(<VerifyScreen />);
    const usernameInput = screen.getByPlaceholderText("Username");
    expect(usernameInput.props.value).toBe("testuser");
  });

  it("calls confirmSignUp with username and code", async () => {
    render(<VerifyScreen />);

    fireEvent.changeText(screen.getByPlaceholderText("6-digit code"), "123456");

    await act(async () => {
      fireEvent.press(screen.getByText("Verify account"));
    });

    await waitFor(() => {
      expect(mockConfirmSignUp).toHaveBeenCalledWith({
        username: "testuser",
        code: "123456",
      });
    });
  });

  it("navigates back to sign in after successful confirmation", async () => {
    render(<VerifyScreen />);

    fireEvent.changeText(screen.getByPlaceholderText("6-digit code"), "123456");

    await act(async () => {
      fireEvent.press(screen.getByText("Verify account"));
    });

    const verificationAlert = alertSpy.mock.calls.find((call) => call[0] === "Account verified");
    expect(verificationAlert).toBeTruthy();
    const buttons = verificationAlert?.[2] as Array<{ text: string; onPress: () => void }>;
    const okButton = buttons.find((button) => button.text === "OK");

    act(() => {
      okButton?.onPress();
    });

    expect(mockReplace).toHaveBeenCalledWith("/");
  });

  it("calls resendSignUpCode when resend is tapped", async () => {
    render(<VerifyScreen />);

    await act(async () => {
      fireEvent.press(screen.getByText("Resend verification code"));
    });

    await waitFor(() => {
      expect(mockResendSignUpCode).toHaveBeenCalledWith({
        username: "testuser",
      });
    });
  });
});
