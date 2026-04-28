import * as LocalAuthentication from "expo-local-authentication";

export type BiometricAvailabilityStatus =
  | "available"
  | "not-supported"
  | "not-enrolled"
  | "error";

export interface BiometricAvailabilityResult {
  status: BiometricAvailabilityStatus;
  available: boolean;
  supportedTypes: LocalAuthentication.AuthenticationType[];
}

export type BiometricPromptStatus =
  | "success"
  | "cancelled"
  | "failed"
  | "lockout"
  | "not-available"
  | "error";

export interface BiometricPromptResult {
  status: BiometricPromptStatus;
  success: boolean;
}

function mapPromptErrorToStatus(
  error: string | undefined,
  didFallbackToPasscode: boolean
): Exclude<BiometricPromptStatus, "success"> {
  if (didFallbackToPasscode) {
    return "failed";
  }

  switch (error) {
    case "user_cancel":
    case "system_cancel":
    case "app_cancel":
      return "cancelled";
    case "lockout":
      return "lockout";
    case "not_enrolled":
    case "passcode_not_set":
    case "not_available":
      return "not-available";
    case "authentication_failed":
    case "user_fallback":
    case "invalid_context":
      return "failed";
    default:
      return "error";
  }
}

export async function canUseBiometrics(): Promise<BiometricAvailabilityResult> {
  try {
    const [hasHardware, isEnrolled, supportedTypes] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
      LocalAuthentication.supportedAuthenticationTypesAsync(),
    ]);

    if (!hasHardware || supportedTypes.length === 0) {
      return {
        status: "not-supported",
        available: false,
        supportedTypes,
      };
    }

    if (!isEnrolled) {
      return {
        status: "not-enrolled",
        available: false,
        supportedTypes,
      };
    }

    return {
      status: "available",
      available: true,
      supportedTypes,
    };
  } catch (error) {
    console.warn("Failed to evaluate biometric availability:", error);
    return {
      status: "error",
      available: false,
      supportedTypes: [],
    };
  }
}

export async function promptBiometricUnlock(
  promptMessage: string = "Unlock with biometrics"
): Promise<BiometricPromptResult> {
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage,
      disableDeviceFallback: false,
    });

    if (result.success) {
      return { status: "success", success: true };
    }

    return {
      status: mapPromptErrorToStatus(result.error, Boolean(result.warning)),
      success: false,
    };
  } catch (error) {
    console.warn("Biometric prompt failed:", error);
    return {
      status: "error",
      success: false,
    };
  }
}
