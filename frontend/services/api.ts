/**
 * API service for making HTTP requests to the backend.
 */

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL;

if (!API_BASE_URL) {
  throw new Error(
    "EXPO_PUBLIC_API_BASE_URL environment variable is not set. " +
    "Please create a .env file in the frontend directory with EXPO_PUBLIC_API_BASE_URL set to your API Gateway URL. " +
    "See README.md for instructions."
  );
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

/**
 * Makes a POST request to the login endpoint.
 */
export async function login(credentials: LoginRequest): Promise<LoginResponse> {
  const response = await fetch(`${API_BASE_URL}/login`, {
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
  const response = await fetch(`${API_BASE_URL}/refresh`, {
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