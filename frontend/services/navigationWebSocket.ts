/**
 * WebSocket service for navigation frame transmission.
 *
 * Manages a WebSocket connection to the backend for sending navigation frames
 * (camera images + sensor data) and receiving navigation updates.
 *
 * The WebSocket URL is derived from the REST API URL by converting it to the
 * corresponding WebSocket endpoint, or uses a dedicated WS env variable.
 */

/**
 * Navigation frame payload sent to the backend via WebSocket.
 * Matches the NavigationFrameMessage schema in the OpenAPI spec.
 */
export interface NavigationFrameMessage {
  action: string;
  session_id: string;
  image_base64: string;
  focal_length_pixels: number;
  heading_degrees: number | null;
  gps: {
    latitude: number;
    longitude: number;
    altitude: number | null;
    accuracy: number | null;
    altitude_accuracy: number | null;
    speed: number | null;
  } | null;
  accelerometer: {
    x: number;
    y: number;
    z: number;
  } | null;
  gyroscope: {
    x: number;
    y: number;
    z: number;
  } | null;
  timestamp_ms: number;
}

/**
 * Response from the backend after processing a navigation frame.
 */
export interface NavigationResponse {
  frameSize?: number;
  valid?: boolean;
  estimatedDistances?: Array<{
    className: string;
    distance: string;
  }>;
  type?: string;
  session_id?: string;
  current_step?: number;
  remaining_instructions?: Array<unknown>;
  estimated_position?: unknown;
  confidence?: number;
  message?: string;
  error?: string;
  status?: string;
}

export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

type MessageHandler = (response: NavigationResponse) => void;
type StatusHandler = (status: ConnectionStatus) => void;

/**
 * WebSocket manager for navigation frame transmission.
 */
export class NavigationWebSocket {
  private ws: WebSocket | null = null;
  private url: string;
  private onMessage: MessageHandler | null = null;
  private onStatusChange: StatusHandler | null = null;
  private _status: ConnectionStatus = "disconnected";
  private _autoReconnect = false;
  private _reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private _reconnectAttempts = 0;
  private _disposed = false;

  /** Delay before attempting auto-reconnect (ms) */
  private static readonly RECONNECT_DELAY_MS = 2000;
  /** Max consecutive auto-reconnect attempts before giving up */
  private static readonly MAX_RECONNECT_ATTEMPTS = 3;

  constructor(wsUrl: string) {
    this.url = wsUrl;
  }

  /** Enable or disable auto-reconnect on unexpected disconnects. */
  set autoReconnect(value: boolean) {
    this._autoReconnect = value;
    if (!value) {
      this._reconnectAttempts = 0;
    }
  }

  get status(): ConnectionStatus {
    return this._status;
  }

  private setStatus(status: ConnectionStatus) {
    this._status = status;
    this.onStatusChange?.(status);
  }

  /**
   * Register a handler for incoming messages.
   */
  setMessageHandler(handler: MessageHandler) {
    this.onMessage = handler;
  }

  /**
   * Register a handler for connection status changes.
   */
  setStatusHandler(handler: StatusHandler) {
    this.onStatusChange = handler;
  }

  /**
   * Connect to the WebSocket server.
   */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this._disposed) {
        reject(new Error("WebSocket has been disposed"));
        return;
      }

      if (this.ws?.readyState === WebSocket.OPEN) {
        resolve();
        return;
      }

      // Close any existing socket in a non-OPEN state
      if (this.ws) {
        try { this.ws.close(); } catch { /* ignore */ }
        this.ws = null;
      }

      // Clear any pending reconnect timer
      if (this._reconnectTimer) {
        clearTimeout(this._reconnectTimer);
        this._reconnectTimer = null;
      }

      this.setStatus("connecting");
      let settled = false;

      try {
        this.ws = new WebSocket(this.url);

        this.ws.onopen = () => {
          console.log("WebSocket connected to:", this.url);
          this._reconnectAttempts = 0; // reset on successful connection
          this.setStatus("connected");
          settled = true;
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const data: NavigationResponse = JSON.parse(event.data);
            this.onMessage?.(data);
          } catch (e) {
            console.error("Failed to parse WebSocket message:", e);
          }
        };

        this.ws.onerror = (event) => {
          console.warn("WebSocket error:", event);
          this.setStatus("error");
          // Only reject the connect promise if we haven't resolved yet
          if (!settled) {
            settled = true;
            reject(new Error("WebSocket connection error"));
          }
        };

        this.ws.onclose = (event) => {
          console.warn(
            `[WebSocket] Disconnected. Code: ${event.code}, Reason: ${event.reason || "none"}, ` +
            `WasClean: ${event.wasClean}`
          );
          this.setStatus("disconnected");
          this.ws = null;

          // Auto-reconnect if enabled, not disposed, and under retry limit
          if (
            this._autoReconnect &&
            !this._disposed &&
            this._reconnectAttempts < NavigationWebSocket.MAX_RECONNECT_ATTEMPTS
          ) {
            this._reconnectAttempts++;
            console.log(
              `Auto-reconnect attempt ${this._reconnectAttempts}/${NavigationWebSocket.MAX_RECONNECT_ATTEMPTS} in ${NavigationWebSocket.RECONNECT_DELAY_MS}ms...`,
            );
            this._reconnectTimer = setTimeout(() => {
              this._reconnectTimer = null;
              this.connect().catch((err) => {
                console.warn("Auto-reconnect failed:", err);
              });
            }, NavigationWebSocket.RECONNECT_DELAY_MS);
          } else if (
            this._autoReconnect &&
            this._reconnectAttempts >= NavigationWebSocket.MAX_RECONNECT_ATTEMPTS
          ) {
            console.warn(
              `Auto-reconnect gave up after ${NavigationWebSocket.MAX_RECONNECT_ATTEMPTS} attempts. Will reconnect on next send.`,
            );
            this._reconnectAttempts = 0; // reset so manual reconnect can work
          }
        };
      } catch (e) {
        this.setStatus("error");
        reject(e);
      }
    });
  }

  /**
   * Send a navigation frame to the backend.
   * 
   * Validates payload size before sending to prevent WebSocket disconnection.
   * API Gateway WebSocket has a default payload limit of 32 KB (can be increased to 128 KB).
   */
  sendFrame(message: NavigationFrameMessage): boolean {
    if (this.ws?.readyState !== WebSocket.OPEN) {
      console.warn("WebSocket not connected, cannot send frame");
      return false;
    }

    try {
      const payload = JSON.stringify(message);
      
      // Calculate payload size in bytes
      // For UTF-8 strings, we can approximate: base64 strings are ASCII (1 byte/char)
      // JSON metadata is also ASCII, so string length approximates byte size
      // Using TextEncoder if available for accuracy, otherwise fall back to string length
      let payloadSizeBytes: number;
      if (typeof TextEncoder !== "undefined") {
        payloadSizeBytes = new TextEncoder().encode(payload).length;
      } else {
        // Fallback: for base64 + JSON (both ASCII), length ≈ bytes
        payloadSizeBytes = payload.length;
      }
      
      // Calculate image size for logging
      const imageBase64Length = message.image_base64.length;
      const imageSizeBytes = Math.round((imageBase64Length * 3) / 4);
      const metadataSizeBytes = payloadSizeBytes - imageBase64Length;
      
      // API Gateway WebSocket default limit is 32 KB (32 * 1024 bytes)
      // Using 25 KB as a conservative threshold to account for:
      // - Base64 encoding overhead (already included in image_base64)
      // - JSON metadata (session_id, sensors, etc.)
      // - Any WebSocket frame overhead
      const MAX_PAYLOAD_SIZE_BYTES = 25 * 1024;
      
      // Always log payload size for debugging
      console.log(
        `[WebSocket] Payload size check: ` +
        `Image=${Math.round(imageSizeBytes / 1024)} KB (base64=${Math.round(imageBase64Length / 1024)} KB), ` +
        `Metadata=${Math.round(metadataSizeBytes / 1024)} KB, ` +
        `Total=${Math.round(payloadSizeBytes / 1024)} KB (limit=${MAX_PAYLOAD_SIZE_BYTES / 1024} KB)`
      );
      
      if (payloadSizeBytes > MAX_PAYLOAD_SIZE_BYTES) {
        console.warn(
          `[WebSocket] ❌ Frame payload too large (${Math.round(payloadSizeBytes / 1024)} KB), skipping send to prevent disconnection. ` +
          `Image: ${Math.round(imageSizeBytes / 1024)} KB raw / ${Math.round(imageBase64Length / 1024)} KB base64, ` +
          `Metadata: ${Math.round(metadataSizeBytes / 1024)} KB, ` +
          `Total: ${Math.round(payloadSizeBytes / 1024)} KB (limit: ${MAX_PAYLOAD_SIZE_BYTES / 1024} KB). ` +
          `Connection will remain open.`
        );
        return false;
      }

      console.log(`[WebSocket] ✅ Sending frame (${Math.round(payloadSizeBytes / 1024)} KB)`);
      this.ws.send(payload);
      return true;
    } catch (e) {
      console.error("[WebSocket] Failed to send WebSocket message:", e);
      return false;
    }
  }

  /**
   * Disconnect from the WebSocket server.
   * Disables auto-reconnect so the close is intentional.
   */
  disconnect() {
    this._disposed = true;
    this._autoReconnect = false;
    this._reconnectAttempts = 0;
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.setStatus("disconnected");
  }

  /**
   * Check if the WebSocket is currently connected.
   */
  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

/**
 * Get the WebSocket URL from environment variables.
 * Falls back to deriving it from the REST API URL.
 */
export function getWebSocketUrl(): string {
  const wsUrl = process.env.EXPO_PUBLIC_WS_API_URL;
  if (wsUrl) {
    // Ensure it has the /prod stage
    return wsUrl.endsWith("/prod") ? wsUrl : `${wsUrl}/prod`;
  }

  // Try to derive from REST API URL
  // REST: https://<id>.execute-api.<region>.amazonaws.com/prod
  // WS:   wss://<ws-id>.execute-api.<region>.amazonaws.com/prod
  // These are different API Gateway IDs, so we can't reliably derive it.
  // The user must set EXPO_PUBLIC_WS_API_URL.
  console.warn(
    "EXPO_PUBLIC_WS_API_URL is not set. WebSocket features will not work. " +
    "Set this in your .env file to your WebSocket API Gateway URL.",
  );
  return "";
}
