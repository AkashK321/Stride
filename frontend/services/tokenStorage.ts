/**
 * Token storage and refresh service using Expo SecureStore for secure token management.
 * 
 * Provides functions to store, retrieve, delete, and refresh authentication tokens securely.
 * Uses expo-secure-store which encrypts data on iOS and uses Android Keystore on Android.
 * Also includes automatic token refresh functionality to keep users logged in.
 */

import * as SecureStore from 'expo-secure-store';
import { refreshToken } from "./api";

const ACCESS_TOKEN_KEY = 'accessToken';
const ID_TOKEN_KEY = 'idToken';
const REFRESH_TOKEN_KEY = 'refreshToken';

export interface Tokens {
  accessToken: string;
  idToken: string;
  refreshToken: string;
}

/**
 * Stores authentication tokens securely.
 */
export async function storeTokens(tokens: Tokens): Promise<void> {
  try {
    await Promise.all([
      SecureStore.setItemAsync(ACCESS_TOKEN_KEY, tokens.accessToken),
      SecureStore.setItemAsync(ID_TOKEN_KEY, tokens.idToken),
      SecureStore.setItemAsync(REFRESH_TOKEN_KEY, tokens.refreshToken),
    ]);
  } catch (error) {
    console.error('Error storing tokens:', error);
    throw new Error('Failed to store authentication tokens');
  }
}

/**
 * Retrieves the access token.
 */
export async function getAccessToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
  } catch (error) {
    console.error('Error retrieving access token:', error);
    return null;
  }
}

/**
 * Retrieves the ID token.
 */
export async function getIdToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(ID_TOKEN_KEY);
  } catch (error) {
    console.error('Error retrieving ID token:', error);
    return null;
  }
}

/**
 * Retrieves the refresh token.
 */
export async function getRefreshToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
  } catch (error) {
    console.error('Error retrieving refresh token:', error);
    return null;
  }
}

/**
 * Retrieves all stored tokens.
 */
export async function getTokens(): Promise<Tokens | null> {
  try {
    const [accessToken, idToken, refreshToken] = await Promise.all([
      SecureStore.getItemAsync(ACCESS_TOKEN_KEY),
      SecureStore.getItemAsync(ID_TOKEN_KEY),
      SecureStore.getItemAsync(REFRESH_TOKEN_KEY),
    ]);

    if (accessToken && idToken && refreshToken) {
      return {
        accessToken,
        idToken,
        refreshToken,
      };
    }

    return null;
  } catch (error) {
    console.error('Error retrieving tokens:', error);
    return null;
  }
}

/**
 * Deletes all stored tokens (logout).
 */
export async function clearTokens(): Promise<void> {
  try {
    await Promise.all([
      SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY),
      SecureStore.deleteItemAsync(ID_TOKEN_KEY),
      SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY),
    ]);
  } catch (error) {
    console.error('Error clearing tokens:', error);
    throw new Error('Failed to clear authentication tokens');
  }
}

/**
 * Checks if the user has stored tokens (is authenticated).
 */
export async function isAuthenticated(): Promise<boolean> {
  try {
    const tokens = await getTokens();
    return tokens !== null;
  } catch (error) {
    console.error('Error checking authentication status:', error);
    return false;
  }
}

/**
 * JWT tokens are base64 encoded. This function decodes and gets expiration time.
 */
function getTokenExpiration(token: string): number | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const payload = JSON.parse(atob(parts[1]));
    return payload.exp ? payload.exp * 1000 : null; // Convert to milliseconds
  } catch (error) {
    console.error("Error parsing token:", error);
    return null;
  }
}

/**
 * Checks if the access token is expired or will expire soon.
 * @param bufferMinutes - Minutes before expiration to consider token as "expiring soon"
 */
export async function isTokenExpiringSoon(bufferMinutes: number = 5): Promise<boolean> {
  try {
    const tokens = await getTokens();
    if (!tokens) return true;

    const expiration = getTokenExpiration(tokens.accessToken);
    if (!expiration) return true; // If we can't parse, assume expired

    const now = Date.now();
    const bufferMs = bufferMinutes * 60 * 1000;
    
    return expiration - now < bufferMs;
  } catch (error) {
    console.error("Error checking token expiration:", error);
    return true;
  }
}

/**
 * Automatically refreshes tokens if they are expiring soon.
 * 
 * If the refresh endpoint is not available, this function will gracefully fail
 * and return false. The app will continue to work, but users will need to
 * log in again when their tokens expire.
 * 
 * @returns true if tokens were refreshed, false otherwise (including if endpoint is unavailable)
 */
export async function autoRefreshTokens(): Promise<boolean> {
  try {
    const tokens = await getTokens();
    if (!tokens) return false;

    // Check if token is expiring soon
    if (!(await isTokenExpiringSoon())) {
      return false; // Token is still valid
    }

    // Attempt to refresh the token
    // If the endpoint doesn't exist (404), this will throw an error
    // which we catch and handle gracefully
    const newTokens = await refreshToken(tokens.refreshToken);
    
    // Store new tokens
    await storeTokens({
      accessToken: newTokens.accessToken,
      idToken: newTokens.idToken,
      refreshToken: newTokens.refreshToken,
    });

    return true;
  } catch (error) {
    // Log error but don't throw - allow app to continue working
    // User will need to log in again when token expires
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.warn("Token refresh unavailable or failed:", errorMessage);
    return false;
  }
}

/**
 * Sets up automatic token refresh on an interval.
 * @param intervalMinutes - How often to check and refresh tokens
 * @returns Cleanup function to stop the interval
 */
export function setupAutoRefresh(intervalMinutes: number = 5): () => void {
  const interval = setInterval(async () => {
    await autoRefreshTokens();
  }, intervalMinutes * 60 * 1000);

  return () => clearInterval(interval);
}
