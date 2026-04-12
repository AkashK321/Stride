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
export function requireApiUrl(): string {
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
  firstName: string;
  lastName: string;
}

export interface RegisterResponse {
  message: string;
  username: string;
}

export interface LandmarkResult {
  landmark_id: number;
  name: string;
  floor_number: number;
  nearest_node: string;
}

export interface SearchResponse {
  results: LandmarkResult[];
}

export interface NavigationStartRequest {
  destination: { landmark_id: string };
  start_location: { node_id: string };
}

export interface NavigationInstruction {
  step: number;
  distance_feet: number;
  direction: string | null;
  turn_at_end?: "left" | "right" | "around" | "straight" | null;
  node_id: string;
  coordinates: { x?: number; y?: number; x_feet?: number; y_feet?: number }; 
}

export interface NavigationStartResponse {
  session_id: string;
  instructions: NavigationInstruction[];
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
  const trimmedEmail = userData.email.trim();
  const requestPayload: RegisterRequest = {
    username: userData.username,
    password: userData.password,
    passwordConfirm: userData.passwordConfirm,
    firstName: userData.firstName,
    lastName: userData.lastName,
    email: trimmedEmail,
  };
  
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestPayload),
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

/**
 * Searches landmarks (rooms, facilities) by name.
 * Uses case-insensitive partial matching on the Landmarks table.
 */
export async function searchLandmarks(
  query: string,
  limit: number = 10
): Promise<SearchResponse> {
  const base = requireApiUrl();
  const params = new URLSearchParams({ query, limit: String(limit) });
  const url = `${base}/search?${params}`;
  console.log("[API] search request:", { query, limit, url });

  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.log("[API] search fetch failed (network error):", err);
    throw err;
  }

  const responseText = await response.text();
  console.log("[API] search response raw:", {
    status: response.status,
    statusText: response.statusText,
    ok: response.ok,
    bodyLength: responseText.length,
    bodyPreview: responseText.slice(0, 200),
  });

  let data: unknown;
  try {
    data = responseText.length > 0 ? JSON.parse(responseText) : {};
  } catch (parseErr) {
    console.log("[API] search response not JSON:", responseText.slice(0, 500));
    throw new Error(`Search failed: response was not JSON (${response.status})`);
  }

  if (!response.ok) {
    const error: ApiError = data as ApiError;
    console.log("[API] search response (error):", { status: response.status, data });
    throw new Error(error.error || `Search failed: ${response.statusText}`);
  }

  console.log("[API] search response:", data);
  return data as SearchResponse;
}

/**
 * Starts a navigation session by calculating the path from a start node
 * to the destination landmark using A* pathfinding.
 */
export async function startNavigation(
  request: NavigationStartRequest
): Promise<NavigationStartResponse> {
  const base = requireApiUrl();
  const url = `${base}/navigation/start`;
  const body = JSON.stringify(request);
  console.log("[API] navigation/start request:", { url, body: request });

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });

  const responseText = await response.text();
  console.log("[API] navigation/start response raw:", {
    status: response.status,
    statusText: response.statusText,
    ok: response.ok,
    bodyLength: responseText.length,
    bodyPreview: responseText.slice(0, 300),
  });

  let data: unknown;
  try {
    data = responseText.length > 0 ? JSON.parse(responseText) : {};
  } catch (parseErr) {
    console.log("[API] navigation/start response not JSON:", responseText.slice(0, 500));
    throw new Error(`Navigation failed: response was not JSON (${response.status})`);
  }

  if (!response.ok) {
    const error: ApiError = data as ApiError;
    console.log("[API] navigation/start response (error):", { status: response.status, data });
    throw new Error(
      error.error || `Navigation failed: ${response.statusText}`
    );
  }

  console.log("[API] navigation/start response:", data);
  return data as NavigationStartResponse;
}