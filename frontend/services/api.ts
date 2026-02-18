/**
 * API service for making HTTP requests to the backend.
 */

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL;

if (!API_BASE_URL) {
  console.warn(
    "EXPO_PUBLIC_API_BASE_URL is not set. API calls will fail. " +
    "If you are using Developer Bypass mode this is expected. " +
    "Otherwise, create a .env file with EXPO_PUBLIC_API_BASE_URL set to your API Gateway URL. " +
    "See docs/FRONTEND.md for instructions."
  );
}

/**
 * Guard that throws if the API URL is not configured.
 * Called at the start of each API function so the app can still
 * load and render (e.g. for Developer Bypass) even without a backend URL.
 */
function requireApiUrl(): string {
  if (!API_BASE_URL) {
    throw new Error(
      "No backend URL configured. Set EXPO_PUBLIC_API_BASE_URL in your .env file to use live endpoints."
    );
  }
  return API_BASE_URL;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  idToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: string;
}

export interface ApiError {
  error: string;
}

export interface RefreshTokenRequest {
  refreshToken: string;
}

export interface RefreshTokenResponse {
  accessToken: string;
  idToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: string;
}

export interface RegisterRequest {
  username: string;
  password: string;
  passwordConfirm: string;
  email: string;
  phoneNumber: string;
  firstName: string;
  lastName: string;
}

export interface RegisterResponse {
  message: string;
  username: string;
}

/**
 * Makes a POST request to the login endpoint.
 */
export async function login(credentials: LoginRequest): Promise<LoginResponse> {
  const url = requireApiUrl();
  const response = await fetch(`${url}/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(credentials),
  });

  const data = await response.json();

  if (!response.ok) {
    const error: ApiError = data;
    throw new Error(error.error || `Login failed: ${response.statusText}`);
  }

  return data as LoginResponse;
}

/**
 * Refreshes authentication tokens using a refresh token.
 * 
 * Note: This endpoint may not be implemented yet. If the endpoint returns 404,
 * the function will throw an error indicating the endpoint is not available.
 * 
 * @throws Error if the refresh endpoint is not available (404) or if refresh fails
 */
export async function refreshToken(refreshToken: string): Promise<RefreshTokenResponse> {
  const url = requireApiUrl();
  const response = await fetch(`${url}/refresh`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ refreshToken }),
  });

  const data = await response.json();

  // API Gateway returns 403 for missing routes, 404 for not found
  if (response.status === 404 || response.status === 403) {
    throw new Error("Refresh endpoint not implemented. Please log in again.");
  }

  if (!response.ok) {
    const error: ApiError = data;
    throw new Error(error.error || `Token refresh failed: ${response.statusText}`);
  }

  return data as RefreshTokenResponse;
}

/**
 * Makes a POST request to the register endpoint.
 */
export async function register(userData: RegisterRequest): Promise<RegisterResponse> {
  const base = requireApiUrl();
  const url = `${base}/register`;
  
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(userData),
    });

    let data;
    try {
      data = await response.json();
    } catch (parseError) {
      // If response is not JSON, get text instead
      const text = await response.text();
      throw new Error(`Registration failed: ${response.status} ${response.statusText}. Response: ${text}`);
    }

    if (!response.ok) {
      const error: ApiError = data;
      const errorMessage = error.error || `Registration failed: ${response.status} ${response.statusText}`;
      throw new Error(errorMessage);
    }

    return data as RegisterResponse;
  } catch (error) {
    // Re-throw if it's already an Error with a message
    if (error instanceof Error) {
      throw error;
    }
    // Otherwise wrap it
    throw new Error(`Registration failed: ${String(error)}`);
  }
}