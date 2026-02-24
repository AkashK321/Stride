/**
 * Unit tests for api.ts
 */

import type {
  LoginResponse,
  RefreshTokenResponse,
  RegisterRequest,
  RegisterResponse,
} from "../api";

// We need to re-import the module per test group to test different env states
// Using require() instead of import() because Jest doesn't support dynamic import() without --experimental-vm-modules
let apiModule: typeof import("../api");

// Store original env
const originalEnv = process.env.EXPO_PUBLIC_API_BASE_URL;

beforeEach(() => {
  jest.resetModules();
  global.fetch = jest.fn();
  // Set env var for most tests
  process.env.EXPO_PUBLIC_API_BASE_URL = "https://test-api.example.com";
});

afterEach(() => {
  jest.restoreAllMocks();
  process.env.EXPO_PUBLIC_API_BASE_URL = originalEnv;
});

describe("requireApiUrl", () => {
  it("throws when EXPO_PUBLIC_API_BASE_URL is not set", () => {
    delete process.env.EXPO_PUBLIC_API_BASE_URL;
    jest.resetModules();
    
    apiModule = require("../api");
    
    expect(() => apiModule.requireApiUrl()).toThrow(
      "No backend URL configured. Set EXPO_PUBLIC_API_BASE_URL in your .env file to use live endpoints."
    );
  });

  it("returns the URL string when env var is set", () => {
    process.env.EXPO_PUBLIC_API_BASE_URL = "https://api.example.com";
    jest.resetModules();
    
    apiModule = require("../api");
    
    const url = apiModule.requireApiUrl();
    expect(url).toBe("https://api.example.com");
  });
});

describe("login", () => {
  beforeEach(() => {
    apiModule = require("../api");
  });

  it("sends correct POST request and returns LoginResponse", async () => {
    const mockResponse: LoginResponse = {
      accessToken: "access-123",
      idToken: "id-456",
      refreshToken: "refresh-789",
      expiresIn: 3600,
      tokenType: "Bearer",
    };

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    const result = await apiModule.login({
      username: "testuser",
      password: "testpass",
    });

    // Verify the request
    expect(global.fetch).toHaveBeenCalledWith(
      "https://test-api.example.com/login",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "testuser", password: "testpass" }),
      })
    );

    // Verify the response
    expect(result).toEqual(mockResponse);
  });

  it("throws with API error message on failure", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
      json: async () => ({ error: "Invalid credentials" }),
    });

    await expect(
      apiModule.login({ username: "bad", password: "bad" })
    ).rejects.toThrow("Invalid credentials");
  });

  it("falls back to statusText when error field is missing", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      json: async () => ({}), // No error field
    });

    await expect(
      apiModule.login({ username: "test", password: "test" })
    ).rejects.toThrow("Login failed: Internal Server Error");
  });

  it("throws when API URL is not configured", async () => {
    delete process.env.EXPO_PUBLIC_API_BASE_URL;
    jest.resetModules();
    
    apiModule = require("../api");
    
    await expect(
      apiModule.login({ username: "test", password: "test" })
    ).rejects.toThrow("No backend URL configured");
  });
});

describe("refreshToken", () => {
  beforeEach(() => {
    apiModule = require("../api");
  });

  it("sends correct POST request and returns RefreshTokenResponse", async () => {
    const mockResponse: RefreshTokenResponse = {
      accessToken: "new-access-123",
      idToken: "new-id-456",
      refreshToken: "new-refresh-789",
      expiresIn: 3600,
      tokenType: "Bearer",
    };

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    const result = await apiModule.refreshToken("refresh-token-123");

    // Verify the request
    expect(global.fetch).toHaveBeenCalledWith(
      "https://test-api.example.com/refresh",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: "refresh-token-123" }),
      })
    );

    // Verify the response
    expect(result).toEqual(mockResponse);
  });

  it("throws when endpoint returns 404", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: "Not Found",
      json: async () => ({}),
    });

    await expect(
      apiModule.refreshToken("refresh-token-123")
    ).rejects.toThrow("Refresh endpoint not implemented. Please log in again.");
  });

  it("throws when endpoint returns 403", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 403,
      statusText: "Forbidden",
      json: async () => ({}),
    });

    await expect(
      apiModule.refreshToken("refresh-token-123")
    ).rejects.toThrow("Refresh endpoint not implemented. Please log in again.");
  });

  it("throws with API error message on other failures", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      json: async () => ({ error: "Token refresh failed" }),
    });

    await expect(
      apiModule.refreshToken("refresh-token-123")
    ).rejects.toThrow("Token refresh failed");
  });

  it("falls back to statusText when error field is missing", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      json: async () => ({}), // No error field
    });

    await expect(
      apiModule.refreshToken("refresh-token-123")
    ).rejects.toThrow("Token refresh failed: Internal Server Error");
  });

  it("throws when API URL is not configured", async () => {
    delete process.env.EXPO_PUBLIC_API_BASE_URL;
    jest.resetModules();
    
    apiModule = require("../api");
    
    await expect(
      apiModule.refreshToken("refresh-token-123")
    ).rejects.toThrow("No backend URL configured");
  });
});

describe("register", () => {
  beforeEach(() => {
    apiModule = require("../api");
  });

  it("sends correct POST request and returns RegisterResponse", async () => {
    const mockResponse: RegisterResponse = {
      message: "User registered successfully",
      username: "testuser",
    };

    const userData: RegisterRequest = {
      username: "testuser",
      password: "password123",
      passwordConfirm: "password123",
      email: "test@example.com",
      phoneNumber: "+1234567890",
      firstName: "Test",
      lastName: "User",
    };

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    const result = await apiModule.register(userData);

    // Verify the request
    expect(global.fetch).toHaveBeenCalledWith(
      "https://test-api.example.com/register",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(userData),
      })
    );

    // Verify the response
    expect(result).toEqual(mockResponse);
  });

  it("throws with API error message on failure", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 400,
      statusText: "Bad Request",
      json: async () => ({ error: "Username already exists" }),
    });

    await expect(
      apiModule.register({
        username: "existinguser",
        password: "password123",
        passwordConfirm: "password123",
        email: "test@example.com",
        phoneNumber: "+1234567890",
        firstName: "Test",
        lastName: "User",
      })
    ).rejects.toThrow("Username already exists");
  });

  it("falls back to statusText when error field is missing", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 400,
      statusText: "Bad Request",
      json: async () => ({}), // No error field
    });

    await expect(
      apiModule.register({
        username: "testuser",
        password: "password123",
        passwordConfirm: "password123",
        email: "test@example.com",
        phoneNumber: "+1234567890",
        firstName: "Test",
        lastName: "User",
      })
    ).rejects.toThrow("Registration failed: 400 Bad Request");
  });

  it("handles non-JSON response by falling back to text", async () => {
    const htmlError = "<html><body>Error 500</body></html>";
    
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      json: async () => {
        throw new Error("Unexpected token < in JSON");
      },
      text: async () => htmlError,
    });

    await expect(
      apiModule.register({
        username: "testuser",
        password: "password123",
        passwordConfirm: "password123",
        email: "test@example.com",
        phoneNumber: "+1234567890",
        firstName: "Test",
        lastName: "User",
      })
    ).rejects.toThrow(`Registration failed: 500 Internal Server Error. Response: ${htmlError}`);
  });

  it("re-throws Error instances as-is", async () => {
    const originalError = new Error("Network error");
    
    (global.fetch as jest.Mock).mockRejectedValueOnce(originalError);

    // Verify the error is re-thrown as-is (same instance)
    let caughtError: unknown;
    try {
      await apiModule.register({
        username: "testuser",
        password: "password123",
        passwordConfirm: "password123",
        email: "test@example.com",
        phoneNumber: "+1234567890",
        firstName: "Test",
        lastName: "User",
      });
    } catch (error) {
      caughtError = error;
    }
    
    expect(caughtError).toBe(originalError);
    expect(caughtError).toBeInstanceOf(Error);
    expect((caughtError as Error).message).toBe("Network error");
  });

  it("wraps non-Error thrown values in a new Error", async () => {
    (global.fetch as jest.Mock).mockRejectedValueOnce("String error");

    await expect(
      apiModule.register({
        username: "testuser",
        password: "password123",
        passwordConfirm: "password123",
        email: "test@example.com",
        phoneNumber: "+1234567890",
        firstName: "Test",
        lastName: "User",
      })
    ).rejects.toThrow("Registration failed: String error");
  });

  it("wraps null/undefined thrown values", async () => {
    (global.fetch as jest.Mock).mockRejectedValueOnce(null);

    await expect(
      apiModule.register({
        username: "testuser",
        password: "password123",
        passwordConfirm: "password123",
        email: "test@example.com",
        phoneNumber: "+1234567890",
        firstName: "Test",
        lastName: "User",
      })
    ).rejects.toThrow("Registration failed: null");
  });

  it("throws when API URL is not configured", async () => {
    delete process.env.EXPO_PUBLIC_API_BASE_URL;
    jest.resetModules();
    
    apiModule = require("../api");
    
    await expect(
      apiModule.register({
        username: "testuser",
        password: "password123",
        passwordConfirm: "password123",
        email: "test@example.com",
        phoneNumber: "+1234567890",
        firstName: "Test",
        lastName: "User",
      })
    ).rejects.toThrow("No backend URL configured");
  });
});
