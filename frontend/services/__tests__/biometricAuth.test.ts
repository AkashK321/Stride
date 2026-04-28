import * as LocalAuthentication from "expo-local-authentication";
import { canUseBiometrics, promptBiometricUnlock } from "../biometricAuth";

const mockHasHardwareAsync = LocalAuthentication.hasHardwareAsync as jest.Mock;
const mockIsEnrolledAsync = LocalAuthentication.isEnrolledAsync as jest.Mock;
const mockSupportedAuthenticationTypesAsync =
  LocalAuthentication.supportedAuthenticationTypesAsync as jest.Mock;
const mockAuthenticateAsync = LocalAuthentication.authenticateAsync as jest.Mock;

describe("biometricAuth", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockHasHardwareAsync.mockResolvedValue(true);
    mockIsEnrolledAsync.mockResolvedValue(true);
    mockSupportedAuthenticationTypesAsync.mockResolvedValue([1]);
    mockAuthenticateAsync.mockResolvedValue({
      success: true,
      error: undefined,
      warning: undefined,
    });
  });

  describe("canUseBiometrics", () => {
    it("returns available when hardware and enrollment exist", async () => {
      const result = await canUseBiometrics();

      expect(result).toEqual({
        status: "available",
        available: true,
        supportedTypes: [1],
      });
    });

    it("returns not-supported when device does not have biometric hardware", async () => {
      mockHasHardwareAsync.mockResolvedValue(false);

      const result = await canUseBiometrics();

      expect(result).toEqual({
        status: "not-supported",
        available: false,
        supportedTypes: [1],
      });
    });

    it("returns not-enrolled when hardware exists but no biometrics are enrolled", async () => {
      mockIsEnrolledAsync.mockResolvedValue(false);

      const result = await canUseBiometrics();

      expect(result).toEqual({
        status: "not-enrolled",
        available: false,
        supportedTypes: [1],
      });
    });
  });

  describe("promptBiometricUnlock", () => {
    it("returns success status when native auth succeeds", async () => {
      const result = await promptBiometricUnlock("Unlock Stride");

      expect(mockAuthenticateAsync).toHaveBeenCalledWith({
        promptMessage: "Unlock Stride",
        disableDeviceFallback: false,
      });
      expect(result).toEqual({ status: "success", success: true });
    });

    it("maps user cancellation into cancelled status", async () => {
      mockAuthenticateAsync.mockResolvedValue({
        success: false,
        error: "user_cancel",
        warning: undefined,
      });

      const result = await promptBiometricUnlock();

      expect(result).toEqual({ status: "cancelled", success: false });
    });

    it("maps lockout failures into lockout status", async () => {
      mockAuthenticateAsync.mockResolvedValue({
        success: false,
        error: "lockout",
        warning: undefined,
      });

      const result = await promptBiometricUnlock();

      expect(result).toEqual({ status: "lockout", success: false });
    });

    it("maps not enrolled errors to not-available status", async () => {
      mockAuthenticateAsync.mockResolvedValue({
        success: false,
        error: "not_enrolled",
        warning: undefined,
      });

      const result = await promptBiometricUnlock();

      expect(result).toEqual({ status: "not-available", success: false });
    });
  });
});
