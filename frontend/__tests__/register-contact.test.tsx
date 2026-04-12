import React from "react";
import { Alert } from "react-native";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import RegisterContact from "../app/(auth)/register-contact";
import * as api from "../services/api";
import { useAuth } from "../contexts/AuthContext";
import { useLocalSearchParams, useRouter } from "expo-router";

jest.mock("expo-router", () => ({
  useRouter: jest.fn(),
  useLocalSearchParams: jest.fn(),
}));

jest.mock("../services/api", () => ({
  register: jest.fn(),
  login: jest.fn(),
}));

jest.mock("../contexts/AuthContext", () => ({
  useAuth: jest.fn(),
}));

jest.mock("react-native-safe-area-context", () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock("../components/Button", () => {
  const React = require("react");
  const { Pressable, Text } = require("react-native");
  return function MockButton({ title, onPress, accessibilityLabel, disabled }: any) {
    return React.createElement(
      Pressable,
      { onPress, accessibilityLabel: accessibilityLabel || title, disabled },
      React.createElement(Text, null, title)
    );
  };
});

jest.mock("../components/TextField", () => {
  const React = require("react");
  const { Text, TextInput, View } = require("react-native");
  return React.forwardRef(function MockTextField(
    { value, onChangeText, placeholder, error, accessibilityLabel }: any,
    ref: any
  ) {
    return React.createElement(
      View,
      null,
      React.createElement(TextInput, {
        ref,
        value,
        onChangeText,
        placeholder,
        accessibilityLabel: accessibilityLabel || placeholder,
      }),
      error ? React.createElement(Text, null, error) : null
    );
  });
});

jest.mock("../components/Label", () => {
  const React = require("react");
  const { Text } = require("react-native");
  return function MockLabel({ children }: any) {
    return React.createElement(Text, null, children);
  };
});

describe("RegisterContact", () => {
  const mockReplace = jest.fn();
  const mockBack = jest.fn();
  const mockAuthLogin = jest.fn();
  const mockRegister = api.register as jest.MockedFunction<typeof api.register>;
  const mockLogin = api.login as jest.MockedFunction<typeof api.login>;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, "alert").mockImplementation(() => {});

    (useRouter as jest.Mock).mockReturnValue({
      replace: mockReplace,
      back: mockBack,
    });
    (useLocalSearchParams as jest.Mock).mockReturnValue({
      firstName: "Test",
      lastName: "User",
      username: "testuser",
      password: "TestPass123!",
    });
    (useAuth as jest.Mock).mockReturnValue({
      login: mockAuthLogin,
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("renders email-only step", () => {
    render(<RegisterContact />);
    expect(screen.getByText("Step 3 of 3: Email")).toBeTruthy();
    expect(screen.getByPlaceholderText("Email")).toBeTruthy();
  });

  it("validates required email", async () => {
    render(<RegisterContact />);
    fireEvent.press(screen.getByText("Create Account"));
    await waitFor(() => {
      expect(screen.getByText("Email is required")).toBeTruthy();
    });
    expect(mockRegister).not.toHaveBeenCalled();
  });

  it("calls register with email-only payload", async () => {
    mockRegister.mockResolvedValue({
      message: "User registered successfully",
      username: "testuser",
    });
    mockLogin.mockResolvedValue({
      accessToken: "access-token",
      idToken: "id-token",
      refreshToken: "refresh-token",
      expiresIn: 3600,
      tokenType: "Bearer",
    });

    render(<RegisterContact />);
    fireEvent.changeText(screen.getByPlaceholderText("Email"), " test@example.com ");
    fireEvent.press(screen.getByText("Create Account"));

    await waitFor(() => {
      expect(mockRegister).toHaveBeenCalledWith({
        username: "testuser",
        password: "TestPass123!",
        passwordConfirm: "TestPass123!",
        firstName: "Test",
        lastName: "User",
        email: "test@example.com",
      });
    });
  });

  it("routes to verify on unconfirmed login error", async () => {
    mockRegister.mockResolvedValue({
      message: "User registered successfully",
      username: "testuser",
    });
    mockLogin.mockRejectedValue(new Error("User account is not confirmed"));

    render(<RegisterContact />);
    fireEvent.changeText(screen.getByPlaceholderText("Email"), "test@example.com");
    fireEvent.press(screen.getByText("Create Account"));

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/verify?username=testuser");
    });
  });

  it("routes to verify on not verified login error", async () => {
    mockRegister.mockResolvedValue({
      message: "User registered successfully",
      username: "testuser",
    });
    mockLogin.mockRejectedValue(new Error("User is not verified"));

    render(<RegisterContact />);
    fireEvent.changeText(screen.getByPlaceholderText("Email"), "test@example.com");
    fireEvent.press(screen.getByText("Create Account"));

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/verify?username=testuser");
    });
  });
});
