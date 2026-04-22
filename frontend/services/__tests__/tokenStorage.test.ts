/**
 * Unit tests for tokenStorage.ts
 */

import * as SecureStore from "expo-secure-store";
import {
  storeTokens,
  getTokens,
  getAccessToken,
  getIdToken,
  getRefreshToken,
  clearTokens,
  setBiometricLoginEnabled,
  getBiometricLoginEnabled,
  clearBiometricLoginPreference,
  isAuthenticated,
  isTokenExpiringSoon,
  autoRefreshTokens,
  setupAutoRefresh,
  Tokens,
} from "../tokenStorage";

// Mock the api module
const mockRefreshToken = jest.fn();
jest.mock("../api", () => ({
  refreshToken: (...args: any[]) => mockRefreshToken(...args),
}));

// Helper function to create fake JWT tokens
function createFakeJwt(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = btoa(JSON.stringify(payload));
  const signature = "fake-signature";
  return `${header}.${body}.${signature}`;
}

describe("tokenStorage", () => {
  beforeEach(() => {
    // Ensure real timers are used (in case fake timers leaked from other tests)
    jest.useRealTimers();
    // Reset the in-memory store (provided by the mock in jest.setup.js)
    (SecureStore as any).__resetStore();
    // Clear mock call history
    mockRefreshToken.mockClear();
  });

  afterEach(() => {
    // Ensure real timers are restored after each test
    jest.useRealTimers();
  });

  describe("storeTokens", () => {
    it("calls SecureStore.setItemAsync for all three tokens concurrently", async () => {
      const tokens: Tokens = {
        accessToken: "access-123",
        idToken: "id-456",
        refreshToken: "refresh-789",
      };

      await storeTokens(tokens);

      expect(SecureStore.setItemAsync).toHaveBeenCalledWith("accessToken", "access-123");
      expect(SecureStore.setItemAsync).toHaveBeenCalledWith("idToken", "id-456");
      expect(SecureStore.setItemAsync).toHaveBeenCalledWith("refreshToken", "refresh-789");
    });

    it("stores all tokens concurrently", async () => {
      const tokens: Tokens = {
        accessToken: "access-123",
        idToken: "id-456",
        refreshToken: "refresh-789",
      };

      await storeTokens(tokens);

      // Verify all three tokens were stored by checking they can be retrieved
      expect(await getAccessToken()).toBe("access-123");
      expect(await getIdToken()).toBe("id-456");
      expect(await getRefreshToken()).toBe("refresh-789");
      
      // Verify all three setItemAsync calls were made (at least 3, may be more from other tests)
      expect(SecureStore.setItemAsync).toHaveBeenCalledWith("accessToken", "access-123");
      expect(SecureStore.setItemAsync).toHaveBeenCalledWith("idToken", "id-456");
      expect(SecureStore.setItemAsync).toHaveBeenCalledWith("refreshToken", "refresh-789");
    });

    it("throws error when storage fails", async () => {
      const tokens: Tokens = {
        accessToken: "access-123",
        idToken: "id-456",
        refreshToken: "refresh-789",
      };

      jest.spyOn(SecureStore, "setItemAsync").mockRejectedValueOnce(new Error("Storage error"));

      await expect(storeTokens(tokens)).rejects.toThrow("Failed to store authentication tokens");
    });
  });

  describe("getTokens", () => {
    it("returns null when no tokens have been stored", async () => {
      const result = await getTokens();
      expect(result).toBeNull();
    });

    it("returns Tokens object with all three fields when tokens are present", async () => {
      const tokens: Tokens = {
        accessToken: "access-123",
        idToken: "id-456",
        refreshToken: "refresh-789",
      };

      await storeTokens(tokens);
      const result = await getTokens();

      expect(result).toEqual(tokens);
    });

    it("returns null if only some tokens are present", async () => {
      // Store only access token
      await SecureStore.setItemAsync("accessToken", "access-123");

      const result = await getTokens();
      expect(result).toBeNull();
    });

    it("returns null if accessToken is missing", async () => {
      await SecureStore.setItemAsync("idToken", "id-456");
      await SecureStore.setItemAsync("refreshToken", "refresh-789");

      const result = await getTokens();
      expect(result).toBeNull();
    });

    it("returns null if idToken is missing", async () => {
      await SecureStore.setItemAsync("accessToken", "access-123");
      await SecureStore.setItemAsync("refreshToken", "refresh-789");

      const result = await getTokens();
      expect(result).toBeNull();
    });

    it("returns null if refreshToken is missing", async () => {
      await SecureStore.setItemAsync("accessToken", "access-123");
      await SecureStore.setItemAsync("idToken", "id-456");

      const result = await getTokens();
      expect(result).toBeNull();
    });

    it("handles errors gracefully and returns null", async () => {
      jest.spyOn(SecureStore, "getItemAsync").mockRejectedValueOnce(new Error("Read error"));

      const result = await getTokens();
      expect(result).toBeNull();
    });
  });

  describe("getAccessToken", () => {
    it("returns the access token when stored", async () => {
      await SecureStore.setItemAsync("accessToken", "access-123");
      const result = await getAccessToken();
      expect(result).toBe("access-123");
    });

    it("returns null when no access token is stored", async () => {
      const result = await getAccessToken();
      expect(result).toBeNull();
    });

    it("handles errors gracefully and returns null", async () => {
      jest.spyOn(SecureStore, "getItemAsync").mockRejectedValueOnce(new Error("Read error"));

      const result = await getAccessToken();
      expect(result).toBeNull();
    });
  });

  describe("getIdToken", () => {
    it("returns the ID token when stored", async () => {
      await SecureStore.setItemAsync("idToken", "id-456");
      const result = await getIdToken();
      expect(result).toBe("id-456");
    });

    it("returns null when no ID token is stored", async () => {
      const result = await getIdToken();
      expect(result).toBeNull();
    });

    it("handles errors gracefully and returns null", async () => {
      jest.spyOn(SecureStore, "getItemAsync").mockRejectedValueOnce(new Error("Read error"));

      const result = await getIdToken();
      expect(result).toBeNull();
    });
  });

  describe("getRefreshToken", () => {
    it("returns the refresh token when stored", async () => {
      await SecureStore.setItemAsync("refreshToken", "refresh-789");
      const result = await getRefreshToken();
      expect(result).toBe("refresh-789");
    });

    it("returns null when no refresh token is stored", async () => {
      const result = await getRefreshToken();
      expect(result).toBeNull();
    });

    it("handles errors gracefully and returns null", async () => {
      jest.spyOn(SecureStore, "getItemAsync").mockRejectedValueOnce(new Error("Read error"));

      const result = await getRefreshToken();
      expect(result).toBeNull();
    });
  });

  describe("clearTokens", () => {
    it("calls SecureStore.deleteItemAsync for all three keys", async () => {
      await clearTokens();

      expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith("accessToken");
      expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith("idToken");
      expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith("refreshToken");
    });

    it("clears all tokens concurrently", async () => {
      // First store some tokens
      const tokens: Tokens = {
        accessToken: "access-123",
        idToken: "id-456",
        refreshToken: "refresh-789",
      };
      await storeTokens(tokens);

      await clearTokens();

      // Verify all three tokens were deleted by checking they're gone
      expect(await getTokens()).toBeNull();
      
      // Verify all three deleteItemAsync calls were made (at least 3, may be more from other tests)
      expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith("accessToken");
      expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith("idToken");
      expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith("refreshToken");
    });

    it("after clearing, getTokens returns null", async () => {
      const tokens: Tokens = {
        accessToken: "access-123",
        idToken: "id-456",
        refreshToken: "refresh-789",
      };

      await storeTokens(tokens);
      expect(await getTokens()).not.toBeNull();

      await clearTokens();
      expect(await getTokens()).toBeNull();
    });

    it("throws error when deletion fails", async () => {
      jest.spyOn(SecureStore, "deleteItemAsync").mockRejectedValueOnce(new Error("Delete error"));

      await expect(clearTokens()).rejects.toThrow("Failed to clear authentication tokens");
    });
  });

  describe("isAuthenticated", () => {
    it("returns true when all tokens are stored", async () => {
      const tokens: Tokens = {
        accessToken: "access-123",
        idToken: "id-456",
        refreshToken: "refresh-789",
      };

      await storeTokens(tokens);
      const result = await isAuthenticated();
      expect(result).toBe(true);
    });

    it("returns false when no tokens are stored", async () => {
      const result = await isAuthenticated();
      expect(result).toBe(false);
    });

    it("returns false when tokens are partially stored", async () => {
      await SecureStore.setItemAsync("accessToken", "access-123");
      // Missing idToken and refreshToken

      const result = await isAuthenticated();
      expect(result).toBe(false);
    });

    it("handles errors gracefully and returns false", async () => {
      jest.spyOn(SecureStore, "getItemAsync").mockRejectedValueOnce(new Error("Read error"));

      const result = await isAuthenticated();
      expect(result).toBe(false);
    });
  });

  describe("biometric login preference", () => {
    it("stores and retrieves enabled biometric login preference", async () => {
      await setBiometricLoginEnabled(true);

      expect(await getBiometricLoginEnabled()).toBe(true);
      expect(SecureStore.setItemAsync).toHaveBeenCalledWith("biometricLoginEnabled", "true");
    });

    it("returns false when biometric login preference is missing", async () => {
      expect(await getBiometricLoginEnabled()).toBe(false);
    });

    it("clears biometric login preference", async () => {
      await setBiometricLoginEnabled(true);
      expect(await getBiometricLoginEnabled()).toBe(true);

      await clearBiometricLoginPreference();
      expect(await getBiometricLoginEnabled()).toBe(false);
      expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith("biometricLoginEnabled");
    });
  });

  describe("isTokenExpiringSoon", () => {
    it("returns true when the access token's exp claim is within the buffer window", async () => {
      // Token that expires in 2 minutes (within default 5-minute buffer)
      const expiringToken = createFakeJwt({
        exp: Math.floor(Date.now() / 1000) + 120, // 2 minutes from now
      });

      const tokens: Tokens = {
        accessToken: expiringToken,
        idToken: "id-456",
        refreshToken: "refresh-789",
      };

      await storeTokens(tokens);
      const result = await isTokenExpiringSoon(5);
      expect(result).toBe(true);
    });

    it("returns false when the token is fresh (expiration far in the future)", async () => {
      // Token that expires in 1 hour
      const freshToken = createFakeJwt({
        exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
      });

      const tokens: Tokens = {
        accessToken: freshToken,
        idToken: "id-456",
        refreshToken: "refresh-789",
      };

      await storeTokens(tokens);
      const result = await isTokenExpiringSoon(5);
      expect(result).toBe(false);
    });

    it("returns true when the token is malformed (cannot parse exp)", async () => {
      const malformedToken = "not.a.valid.jwt";

      const tokens: Tokens = {
        accessToken: malformedToken,
        idToken: "id-456",
        refreshToken: "refresh-789",
      };

      await storeTokens(tokens);
      const result = await isTokenExpiringSoon(5);
      expect(result).toBe(true);
    });

    it("returns true when no tokens are stored", async () => {
      const result = await isTokenExpiringSoon(5);
      expect(result).toBe(true);
    });

    it("uses custom buffer minutes", async () => {
      // Token that expires in 10 minutes
      const token = createFakeJwt({
        exp: Math.floor(Date.now() / 1000) + 600, // 10 minutes from now
      });

      const tokens: Tokens = {
        accessToken: token,
        idToken: "id-456",
        refreshToken: "refresh-789",
      };

      await storeTokens(tokens);

      // With 5-minute buffer, should be false (10 > 5)
      expect(await isTokenExpiringSoon(5)).toBe(false);

      // With 15-minute buffer, should be true (10 < 15)
      expect(await isTokenExpiringSoon(15)).toBe(true);
    });

    it("returns true when token has already expired", async () => {
      // Token that expired 1 minute ago
      const expiredToken = createFakeJwt({
        exp: Math.floor(Date.now() / 1000) - 60, // 1 minute ago
      });

      const tokens: Tokens = {
        accessToken: expiredToken,
        idToken: "id-456",
        refreshToken: "refresh-789",
      };

      await storeTokens(tokens);
      const result = await isTokenExpiringSoon(5);
      expect(result).toBe(true);
    });

    it("handles errors gracefully and returns true", async () => {
      jest.spyOn(SecureStore, "getItemAsync").mockRejectedValueOnce(new Error("Read error"));

      const result = await isTokenExpiringSoon(5);
      expect(result).toBe(true);
    });
  });

  describe("autoRefreshTokens", () => {
    beforeEach(() => {
      mockRefreshToken.mockClear();
    });

    it("calls refreshToken API when the token is expiring soon", async () => {
      // Token that expires in 2 minutes
      const expiringToken = createFakeJwt({
        exp: Math.floor(Date.now() / 1000) + 120,
      });

      const tokens: Tokens = {
        accessToken: expiringToken,
        idToken: "id-456",
        refreshToken: "refresh-789",
      };

      await storeTokens(tokens);

      const newTokens = {
        accessToken: "new-access-123",
        idToken: "new-id-456",
        refreshToken: "new-refresh-789",
        expiresIn: 3600,
        tokenType: "Bearer",
      };

      mockRefreshToken.mockResolvedValueOnce(newTokens);

      const result = await autoRefreshTokens();

      expect(mockRefreshToken).toHaveBeenCalledWith("refresh-789");
      expect(result).toBe(true);
    });

    it("stores the new tokens from the API response", async () => {
      const expiringToken = createFakeJwt({
        exp: Math.floor(Date.now() / 1000) + 120,
      });

      const tokens: Tokens = {
        accessToken: expiringToken,
        idToken: "id-456",
        refreshToken: "refresh-789",
      };

      await storeTokens(tokens);

      const newTokens = {
        accessToken: "new-access-123",
        idToken: "new-id-456",
        refreshToken: "new-refresh-789",
        expiresIn: 3600,
        tokenType: "Bearer",
      };

      mockRefreshToken.mockResolvedValueOnce(newTokens);

      await autoRefreshTokens();

      const storedTokens = await getTokens();
      expect(storedTokens).toEqual({
        accessToken: "new-access-123",
        idToken: "new-id-456",
        refreshToken: "new-refresh-789",
      });
    });

    it("returns true on successful refresh", async () => {
      const expiringToken = createFakeJwt({
        exp: Math.floor(Date.now() / 1000) + 120,
      });

      const tokens: Tokens = {
        accessToken: expiringToken,
        idToken: "id-456",
        refreshToken: "refresh-789",
      };

      await storeTokens(tokens);

      const newTokens = {
        accessToken: "new-access-123",
        idToken: "new-id-456",
        refreshToken: "new-refresh-789",
        expiresIn: 3600,
        tokenType: "Bearer",
      };

      mockRefreshToken.mockResolvedValueOnce(newTokens);

      const result = await autoRefreshTokens();
      expect(result).toBe(true);
    });

    it("returns false when no tokens are stored", async () => {
      const result = await autoRefreshTokens();
      expect(result).toBe(false);
      expect(mockRefreshToken).not.toHaveBeenCalled();
    });

    it("returns false when token is still valid (not expiring soon)", async () => {
      // Token that expires in 1 hour
      const freshToken = createFakeJwt({
        exp: Math.floor(Date.now() / 1000) + 3600,
      });

      const tokens: Tokens = {
        accessToken: freshToken,
        idToken: "id-456",
        refreshToken: "refresh-789",
      };

      await storeTokens(tokens);

      const result = await autoRefreshTokens();
      expect(result).toBe(false);
      expect(mockRefreshToken).not.toHaveBeenCalled();
    });

    it("returns false (does not throw) when the refresh endpoint is unavailable", async () => {
      const expiringToken = createFakeJwt({
        exp: Math.floor(Date.now() / 1000) + 120,
      });

      const tokens: Tokens = {
        accessToken: expiringToken,
        idToken: "id-456",
        refreshToken: "refresh-789",
      };

      await storeTokens(tokens);

      // Simulate 404 error (endpoint not implemented)
      mockRefreshToken.mockRejectedValueOnce(
        new Error("Refresh endpoint not implemented. Please log in again.")
      );

      const result = await autoRefreshTokens();
      expect(result).toBe(false);
    });

    it("returns false when refresh fails with other error", async () => {
      const expiringToken = createFakeJwt({
        exp: Math.floor(Date.now() / 1000) + 120,
      });

      const tokens: Tokens = {
        accessToken: expiringToken,
        idToken: "id-456",
        refreshToken: "refresh-789",
      };

      await storeTokens(tokens);

      mockRefreshToken.mockRejectedValueOnce(new Error("Network error"));

      const result = await autoRefreshTokens();
      expect(result).toBe(false);
    });

    it("handles non-Error thrown values", async () => {
      const expiringToken = createFakeJwt({
        exp: Math.floor(Date.now() / 1000) + 120,
      });

      const tokens: Tokens = {
        accessToken: expiringToken,
        idToken: "id-456",
        refreshToken: "refresh-789",
      };

      await storeTokens(tokens);

      mockRefreshToken.mockRejectedValueOnce("String error");

      const result = await autoRefreshTokens();
      expect(result).toBe(false);
    });
  });

  describe("setupAutoRefresh", () => {
    beforeEach(() => {
      jest.useFakeTimers();
      mockRefreshToken.mockClear();
    });

    afterEach(() => {
      // Ensure all timers are cleared before restoring
      jest.clearAllTimers();
      jest.useRealTimers();
    });

    it("returns a cleanup function", () => {
      const cleanup = setupAutoRefresh(5);
      expect(typeof cleanup).toBe("function");
    });

    it("calls autoRefreshTokens on the specified interval", async () => {
      // Set up tokens that are expiring soon
      const expiringToken = createFakeJwt({
        exp: Math.floor(Date.now() / 1000) + 120,
      });

      const tokens: Tokens = {
        accessToken: expiringToken,
        idToken: "id-456",
        refreshToken: "refresh-789",
      };

      await storeTokens(tokens);

      const newTokens = {
        accessToken: "new-access-123",
        idToken: "new-id-456",
        refreshToken: "new-refresh-789",
        expiresIn: 3600,
        tokenType: "Bearer",
      };

      mockRefreshToken.mockResolvedValue(newTokens);

      const intervalSpy = jest.spyOn(global, "setInterval");
      setupAutoRefresh(5); // 5-minute interval

      // Get the callback function passed to setInterval
      const intervalCallback = intervalSpy.mock.calls[0][0];

      // Call it directly to simulate interval firing
      await intervalCallback();

      expect(mockRefreshToken).toHaveBeenCalled();
      intervalSpy.mockRestore();
    });

    it("calls autoRefreshTokens multiple times when interval fires multiple times", async () => {
      const expiringToken = createFakeJwt({
        exp: Math.floor(Date.now() / 1000) + 120,
      });

      const tokens: Tokens = {
        accessToken: expiringToken,
        idToken: "id-456",
        refreshToken: "refresh-789",
      };

      await storeTokens(tokens);

      const newTokens = {
        accessToken: "new-access-123",
        idToken: "new-id-456",
        refreshToken: "new-refresh-789",
        expiresIn: 3600,
        tokenType: "Bearer",
      };

      mockRefreshToken.mockResolvedValue(newTokens);

      const intervalSpy = jest.spyOn(global, "setInterval");
      setupAutoRefresh(5);

      // Get the callback function
      const intervalCallback = intervalSpy.mock.calls[0][0];

      // Call it twice to simulate multiple intervals
      await intervalCallback();
      await intervalCallback();

      expect(mockRefreshToken).toHaveBeenCalledTimes(2);
      intervalSpy.mockRestore();
    });

    it("cleanup function clears the interval", () => {
      const clearIntervalSpy = jest.spyOn(global, "clearInterval");
      const cleanup = setupAutoRefresh(5);

      expect(typeof cleanup).toBe("function");

      // Cleanup
      cleanup();

      expect(clearIntervalSpy).toHaveBeenCalled();
      clearIntervalSpy.mockRestore();
    });

    it("uses custom interval minutes", () => {
      const intervalSpy = jest.spyOn(global, "setInterval");
      setupAutoRefresh(2); // 2-minute interval

      expect(intervalSpy).toHaveBeenCalledWith(
        expect.any(Function),
        2 * 60 * 1000
      );
      intervalSpy.mockRestore();
    });
  });
});
