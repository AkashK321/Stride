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
    jest.useRealTimers();
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

  it("requires username before verify", async () => {
    mockParams = {};
    render(<VerifyScreen />);

    fireEvent.changeText(screen.getByPlaceholderText("6-digit code"), "123456");
    fireEvent.press(screen.getByText("Verify account"));

    await waitFor(() => {
      expect(screen.getByText("Username is required")).toBeTruthy();
    });
    expect(mockConfirmSignUp).not.toHaveBeenCalled();
  });

  it("requires code before verify", async () => {
    render(<VerifyScreen />);

    fireEvent.press(screen.getByText("Verify account"));

    await waitFor(() => {
      expect(screen.getByText("Verification code is required")).toBeTruthy();
    });
    expect(mockConfirmSignUp).not.toHaveBeenCalled();
  });

  it("sanitizes verification code input to 6 digits", () => {
    render(<VerifyScreen />);

    const codeInput = screen.getByPlaceholderText("6-digit code");
    fireEvent.changeText(codeInput, "12ab34 56xyz7");

    expect(screen.getByPlaceholderText("6-digit code").props.value).toBe("123456");
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

  it("shows backend error message when confirmation fails", async () => {
    mockConfirmSignUp.mockRejectedValueOnce(new Error("Verification code is invalid"));
    render(<VerifyScreen />);

    fireEvent.changeText(screen.getByPlaceholderText("6-digit code"), "000000");
    fireEvent.press(screen.getByText("Verify account"));

    await waitFor(() => {
      expect(screen.getByText("Verification code is invalid")).toBeTruthy();
    });
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

  it("requires username before resend", async () => {
    mockParams = {};
    render(<VerifyScreen />);

    fireEvent.press(screen.getByText("Resend verification code"));

    await waitFor(() => {
      expect(screen.getByText("Username is required")).toBeTruthy();
    });
    expect(mockResendSignUpCode).not.toHaveBeenCalled();
  });

  it("starts resend cooldown and blocks repeat resend while cooling down", async () => {
    jest.useFakeTimers();
    render(<VerifyScreen />);

    fireEvent.press(screen.getByText("Resend verification code"));

    await waitFor(() => {
      expect(mockResendSignUpCode).toHaveBeenCalledTimes(1);
      expect(screen.getByText("Resend code (30s)")).toBeTruthy();
    });

    fireEvent.press(screen.getByText("Resend code (30s)"));
    expect(mockResendSignUpCode).toHaveBeenCalledTimes(1);

    await act(async () => {
      jest.advanceTimersByTime(2000);
    });

    // Cooldown should tick down over time and still block extra resend attempts.
    expect(screen.getByText(/Resend code \(\d+s\)/)).toBeTruthy();
    expect(mockResendSignUpCode).toHaveBeenCalledTimes(1);
  });

  it("shows resend error message", async () => {
    mockResendSignUpCode.mockRejectedValueOnce(new Error("Too many requests. Please try again later"));
    render(<VerifyScreen />);

    fireEvent.press(screen.getByText("Resend verification code"));

    await waitFor(() => {
      expect(screen.getByText("Too many requests. Please try again later")).toBeTruthy();
    });
  });
});
