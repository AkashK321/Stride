/**
 * Navigation screen — camera frame capture and transmission to the backend.
 *
 * Provides two modes:
 * 1. Manual Frame — capture a single photo, attach sensor data, send via WebSocket
 * 2. Navigation Mode — continuous loop capturing and sending at configurable intervals (default: 0.5s)
 *
 * Uses expo-camera for frame capture, expo-location for GPS/heading,
 * expo-sensors for accelerometer/gyroscope, and a WebSocket connection for
 * real-time communication with the backend ObjectDetectionHandler.
 */

import * as React from "react";
import {
  View,
  Text,
  Alert,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Pressable,
  Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Ionicons } from "@expo/vector-icons";
import Button from "../../components/Button";
import { colors } from "../../theme/colors";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";
import { getFocalLengthPixels } from "../../services/focalLength";
import {
  NavigationWebSocket,
  NavigationFrameMessage,
  NavigationResponse,
  ConnectionStatus,
  getWebSocketUrl,
} from "../../services/navigationWebSocket";
import { useSensorData } from "../../hooks/useSensorData";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";

/**
 * Default settings for frame capture.
 * These can be changed via the settings panel.
 */
const DEFAULT_FRAME_WIDTH = 360;
const DEFAULT_JPEG_QUALITY = 0.5;
const DEFAULT_SEND_INTERVAL_MS = 500;

/**
 * Formats JSON with color styling for better readability.
 * Simple approach: split by common patterns and apply colors.
 */
function formatJsonForDisplay(data: any): React.ReactElement {
  const jsonString = JSON.stringify(data, null, 3);
  const lines = jsonString.split("\n");
  const elements: React.ReactElement[] = [];

  lines.forEach((line, lineIndex) => {
    // Simple tokenization: split by common JSON patterns
    const parts: React.ReactElement[] = [];
    let remaining = line;
    let partIndex = 0;

    while (remaining.length > 0) {
      // Match key: "key":
      const keyMatch = remaining.match(/^(\s*)"([^"]+)":/);
      if (keyMatch) {
        parts.push(
          React.createElement(Text, {
            key: `part-${lineIndex}-${partIndex++}`,
            style: styles.jsonDefault,
          }, keyMatch[1] + '"'),
        );
        parts.push(
          React.createElement(Text, {
            key: `part-${lineIndex}-${partIndex++}`,
            style: styles.jsonKey,
          }, keyMatch[2]),
        );
        parts.push(
          React.createElement(Text, {
            key: `part-${lineIndex}-${partIndex++}`,
            style: styles.jsonDefault,
          }, '":'),
        );
        remaining = remaining.substring(keyMatch[0].length);
        continue;
      }

      // Match string value: "value"
      const stringMatch = remaining.match(/^:\s*"([^"]*)"/);
      if (stringMatch) {
        parts.push(
          React.createElement(Text, {
            key: `part-${lineIndex}-${partIndex++}`,
            style: styles.jsonPunctuation,
          }, ': '),
        );
        parts.push(
          React.createElement(Text, {
            key: `part-${lineIndex}-${partIndex++}`,
            style: styles.jsonString,
          }, '"' + stringMatch[1] + '"'),
        );
        remaining = remaining.substring(stringMatch[0].length);
        continue;
      }

      // Match number value: 123 or 123.45
      const numberMatch = remaining.match(/^:\s*(\d+\.?\d*)/);
      if (numberMatch) {
        parts.push(
          React.createElement(Text, {
            key: `part-${lineIndex}-${partIndex++}`,
            style: styles.jsonPunctuation,
          }, ': '),
        );
        parts.push(
          React.createElement(Text, {
            key: `part-${lineIndex}-${partIndex++}`,
            style: styles.jsonNumber,
          }, numberMatch[1]),
        );
        remaining = remaining.substring(numberMatch[0].length);
        continue;
      }

      // Match boolean: true or false
      const boolMatch = remaining.match(/^:\s*(true|false)/);
      if (boolMatch) {
        parts.push(
          React.createElement(Text, {
            key: `part-${lineIndex}-${partIndex++}`,
            style: styles.jsonPunctuation,
          }, ': '),
        );
        parts.push(
          React.createElement(Text, {
            key: `part-${lineIndex}-${partIndex++}`,
            style: styles.jsonBoolean,
          }, boolMatch[1]),
        );
        remaining = remaining.substring(boolMatch[0].length);
        continue;
      }

      // Match null
      const nullMatch = remaining.match(/^:\s*(null)/);
      if (nullMatch) {
        parts.push(
          React.createElement(Text, {
            key: `part-${lineIndex}-${partIndex++}`,
            style: styles.jsonPunctuation,
          }, ': '),
        );
        parts.push(
          React.createElement(Text, {
            key: `part-${lineIndex}-${partIndex++}`,
            style: styles.jsonNull,
          }, 'null'),
        );
        remaining = remaining.substring(nullMatch[0].length);
        continue;
      }

      // Match punctuation: { } [ ] ,
      const punctMatch = remaining.match(/^([{}[\],])/);
      if (punctMatch) {
        parts.push(
          React.createElement(Text, {
            key: `part-${lineIndex}-${partIndex++}`,
            style: styles.jsonPunctuation,
          }, punctMatch[1]),
        );
        remaining = remaining.substring(1);
        continue;
      }

      // Default: take one character
      parts.push(
        React.createElement(Text, {
          key: `part-${lineIndex}-${partIndex++}`,
          style: styles.jsonDefault,
        }, remaining[0]),
      );
      remaining = remaining.substring(1);
    }

    // If no parts were created, add the whole line
    if (parts.length === 0) {
      parts.push(
        React.createElement(Text, {
          key: `line-${lineIndex}`,
          style: styles.jsonDefault,
        }, line),
      );
    }

    elements.push(
      React.createElement(
        Text,
        { key: `line-${lineIndex}`, style: styles.jsonLine },
        ...parts,
      ),
    );
  });

  return React.createElement(View, null, ...elements);
}

/** Session ID for the current navigation session */
const SESSION_ID = "nav_dev_session";

export default function Navigation() {
  // Camera
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const cameraRef = React.useRef<CameraView>(null);

  // WebSocket
  const wsRef = React.useRef<NavigationWebSocket | null>(null);
  const [wsStatus, setWsStatus] = React.useState<ConnectionStatus>("disconnected");

  // Sensors
  const { getSnapshot, start: startSensors, stop: stopSensors, isActive: sensorsActive } =
    useSensorData();

  // Navigation state
  const [isNavActive, setIsNavActive] = React.useState(false);
  const [isSending, setIsSending] = React.useState(false);
  const navIntervalRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  // Response display
  const [lastResponse, setLastResponse] = React.useState<NavigationResponse | null>(null);
  const [frameCount, setFrameCount] = React.useState(0);
  const [lastError, setLastError] = React.useState<string | null>(null);

  // Sent data display (stores the last sent message without image_base64)
  const [lastSentData, setLastSentData] = React.useState<Omit<NavigationFrameMessage, "image_base64"> & { image_size_bytes: number } | null>(null);

  // Tab toggle for data display
  const [activeTab, setActiveTab] = React.useState<"sent" | "response">("response");

  // Last compressed frame URI for preview (shows exactly what the backend receives)
  const [lastFrameUri, setLastFrameUri] = React.useState<string | null>(null);

  // Settings state
  const [showSettings, setShowSettings] = React.useState(false);
  const [frameWidth, setFrameWidth] = React.useState(DEFAULT_FRAME_WIDTH);
  const [jpegQuality, setJpegQuality] = React.useState(DEFAULT_JPEG_QUALITY);
  const [sendIntervalMs, setSendIntervalMs] = React.useState(DEFAULT_SEND_INTERVAL_MS);

  // Focal length (computed once on mount)
  const focalLengthPixels = React.useMemo(() => getFocalLengthPixels(), []);

  // Initialize WebSocket (connect on demand, not eagerly)
  React.useEffect(() => {
    const wsUrl = getWebSocketUrl();
    if (wsUrl) {
      const ws = new NavigationWebSocket(wsUrl);
      ws.setStatusHandler(setWsStatus);
      ws.setMessageHandler((response) => {
        setLastResponse(response);
        setLastError(null);

        // If navigation is complete, stop the loop
        if (response.type === "navigation_complete" && navIntervalRef.current) {
          stopNavLoop();
        }
        // If error response, show it
        if (response.type === "navigation_error" || response.error || response.status === "error") {
          setLastError(response.error || response.message || "Unknown error from backend");
        }
      });
      wsRef.current = ws;
    }

    return () => {
      wsRef.current?.disconnect();
      wsRef.current = null;
    };
  }, []);

  // Cleanup nav loop on unmount
  React.useEffect(() => {
    return () => {
      if (navIntervalRef.current) {
        clearInterval(navIntervalRef.current);
        navIntervalRef.current = null;
      }
      stopSensors();
    };
  }, [stopSensors]);

  /**
   * Ensure the WebSocket is connected and sensors are running.
   * Enables auto-reconnect so the connection stays alive during use.
   */
  const connectAndStartSensors = async () => {
    try {
      if (!wsRef.current) {
        Alert.alert("Configuration Error", "WebSocket URL is not configured. Set EXPO_PUBLIC_WS_API_URL in your .env file.");
        return false;
      }
      // Enable auto-reconnect now that the user is actively using the connection
      wsRef.current.autoReconnect = true;
      // Connect only if not already connected
      if (!wsRef.current.isConnected()) {
        await wsRef.current.connect();
      }
      if (!sensorsActive) {
        await startSensors();
      }
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to connect";
      setLastError(msg);
      Alert.alert("Connection Failed", msg);
      return false;
    }
  };

  /**
   * Capture a frame from the camera and assemble the payload.
   */
  const captureAndSend = React.useCallback(async () => {
    if (!cameraRef.current) {
      setLastError("Camera not ready");
      return;
    }

    if (!wsRef.current?.isConnected()) {
      setLastError("WebSocket not connected");
      return;
    }

    try {
      setIsSending(true);

      // Capture photo — only need the URI, we'll resize before encoding to base64
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.7,
        base64: false,
      });

      if (!photo?.uri) {
        setLastError("Failed to capture photo — no URI");
        return;
      }

      // Resize to configured width to stay under API Gateway's 32 KB WS payload limit.
      // YOLOv11 resizes to 640×640 internally, so detection quality is preserved.
      const resized = await manipulateAsync(
        photo.uri,
        [{ resize: { width: frameWidth } }],
        { base64: true, compress: jpegQuality, format: SaveFormat.JPEG },
      );

      if (!resized.base64) {
        setLastError("Failed to resize photo — no base64 data");
        return;
      }

      // Store the compressed frame URI for in-app preview
      setLastFrameUri(resized.uri);

      // Get current sensor readings
      const sensors = getSnapshot();

      // Generate request ID for latency tracking
      const requestId = wsRef.current.generateRequestId();

      // Assemble the NavigationFrameMessage
      const message: NavigationFrameMessage = {
        action: "frame",
        session_id: SESSION_ID,
        image_base64: resized.base64,
        focal_length_pixels: focalLengthPixels,
        heading_degrees: sensors.heading,
        gps: sensors.gps,
        accelerometer: sensors.accelerometer,
        gyroscope: sensors.gyroscope,
        timestamp_ms: Date.now(),
        request_id: requestId,
      };

      // Store the sent data for display (exclude the large base64 image)
      const { image_base64, ...sentWithoutImage } = message;
      setLastSentData({
        ...sentWithoutImage,
        image_size_bytes: Math.round((image_base64.length * 3) / 4), // approximate decoded size
      });

      const sent = wsRef.current.sendFrame(message);
      if (sent) {
        setFrameCount((c) => c + 1);
        setLastError(null); // Clear any previous errors on successful send
      } else {
        // Check if the payload might be too large
        const payloadSize = JSON.stringify(message).length;
        const maxSize = 30 * 1024; // 30 KB limit
        if (payloadSize > maxSize) {
          const imageSizeKB = Math.round((message.image_base64.length * 3) / 4 / 1024);
          setLastError(
            `Frame too large (${Math.round(payloadSize / 1024)} KB). ` +
            `Image: ${imageSizeKB} KB. Skipped to prevent disconnection. ` +
            `Check console for details.`
          );
        } else {
          setLastError("Failed to send frame via WebSocket");
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Capture failed";
      setLastError(msg);
      console.error("Frame capture error:", e);
    } finally {
      setIsSending(false);
    }
  }, [frameWidth, jpegQuality, focalLengthPixels, getSnapshot]);

  /**
   * Handle manual "Send Frame" button press.
   */
  const handleSendFrame = async () => {
    if (!wsRef.current?.isConnected()) {
      const connected = await connectAndStartSensors();
      if (!connected) return;
    }
    await captureAndSend();
  };

  /**
   * Start continuous navigation mode (capture every 2 seconds).
   */
  const startNavLoop = async () => {
    if (!wsRef.current?.isConnected()) {
      const connected = await connectAndStartSensors();
      if (!connected) return;
    }

    setIsNavActive(true);
    setShowSettings(false); // Close settings panel when navigation starts
    setFrameCount(0);
    setLastError(null);

    // Send first frame immediately
    await captureAndSend();

    // Then start the interval with configured frequency
    navIntervalRef.current = setInterval(async () => {
      await captureAndSend();
    }, sendIntervalMs);
  };

  /**
   * Stop continuous navigation mode.
   */
  const stopNavLoop = () => {
    if (navIntervalRef.current) {
      clearInterval(navIntervalRef.current);
      navIntervalRef.current = null;
    }
    setIsNavActive(false);
  };

  /**
   * Toggle navigation mode on/off.
   */
  const handleToggleNav = () => {
    if (isNavActive) {
      stopNavLoop();
    } else {
      startNavLoop();
    }
  };

  // --- Permission handling ---
  if (!cameraPermission) {
    return React.createElement(
      SafeAreaView,
      { style: styles.centered, edges: ["top"] as const },
      React.createElement(ActivityIndicator, { size: "large", color: colors.primary }),
    );
  }

  if (!cameraPermission.granted) {
    return React.createElement(
      SafeAreaView,
      { style: styles.centered, edges: ["top"] as const },
      React.createElement(
        Text,
        { style: styles.permissionText },
        "Camera permission is required for navigation frame capture.",
      ),
      React.createElement(Button, {
        onPress: requestCameraPermission,
        title: "Grant Camera Permission",
        accessibilityLabel: "Grant camera permission",
        accessibilityRole: "button",
        accessibilityHint: "Allow Stride to access your camera for navigation",
      }),
    );
  }

  // --- Main render ---
  return React.createElement(
    SafeAreaView,
    { style: styles.container, edges: ["top"] as const },

    // Camera preview
    React.createElement(
      View,
      { style: styles.cameraContainer },
      React.createElement(CameraView, {
        ref: cameraRef,
        style: styles.camera,
        facing: "back",
      }),
      // Connection status badge
      React.createElement(
        View,
        { style: [styles.statusBadge, statusBadgeColor(wsStatus)] },
        React.createElement(
          Text,
          { style: styles.statusText },
          wsStatus.toUpperCase(),
        ),
      ),
    ),

    // Controls and response area
    React.createElement(
      ScrollView,
      {
        style: styles.controlsContainer,
        contentContainerStyle: styles.controlsContent,
        showsVerticalScrollIndicator: false,
      },

      // Frame counter
      React.createElement(
        Text,
        { style: styles.frameCounter },
        `Frames sent: ${frameCount}`,
      ),

      // Buttons row
      React.createElement(
        View,
        { style: styles.buttonRow },

        // Send Frame button (smaller, on left)
        React.createElement(Button, {
          onPress: handleSendFrame,
          title: "Send Frame",
          size: "small",
          disabled: isSending || isNavActive,
          loading: isSending && !isNavActive,
          style: styles.sendFrameButton,
          accessibilityLabel: "Send a single camera frame",
          accessibilityRole: "button",
          accessibilityHint: "Captures a photo and sends it to the backend with sensor data",
        }),

        // Right-justified icon buttons container
        React.createElement(
          View,
          { style: styles.rightButtonsContainer },
          // Settings button (gear icon)
          React.createElement(
            Pressable,
            {
              onPress: () => setShowSettings(!showSettings),
              disabled: isNavActive,
              style: [
                styles.iconButton,
                styles.settingsButton,
                showSettings && styles.settingsButtonActive,
                isNavActive && styles.iconButtonDisabled,
              ],
              accessibilityLabel: isNavActive
                ? "Settings unavailable during navigation"
                : showSettings
                  ? "Hide settings"
                  : "Show settings",
              accessibilityRole: "button",
            },
            React.createElement(Ionicons, {
              name: "settings",
              size: 24,
              color: "#FFFFFF",
            }),
          ),

          // Play/Stop Navigation button (icon button, on right)
          React.createElement(
            Pressable,
            {
              onPress: handleToggleNav,
              disabled: isSending && !isNavActive,
              style: [
                styles.iconButton,
                isNavActive && styles.iconButtonActive,
                (isSending && !isNavActive) && styles.iconButtonDisabled,
              ],
              accessibilityLabel: isNavActive
                ? "Stop continuous navigation"
                : "Start continuous navigation",
              accessibilityRole: "button",
              accessibilityHint: isNavActive
                ? "Stops the automatic frame capture loop"
                : `Starts capturing and sending frames every ${sendIntervalMs / 1000}s`,
            },
            React.createElement(Ionicons, {
              name: isNavActive ? "stop" : "play",
              size: 24,
              color: "#FFFFFF",
            }),
          ),
        ),
      ),

      // Settings panel (collapsible)
      showSettings &&
        React.createElement(
          View,
          { style: styles.settingsPanel },
          React.createElement(
            Text,
            { style: styles.settingsHeader },
            "Capture Settings",
          ),

          // Image Width
          React.createElement(
            View,
            { style: styles.settingsRow },
            React.createElement(
              Text,
              { style: styles.settingsLabel },
              "Image Width:",
            ),
            React.createElement(
              View,
              { style: styles.settingsOptions },
              [240, 360, 480, 640].map((width) =>
                React.createElement(
                  Pressable,
                  {
                    key: width,
                    onPress: () => setFrameWidth(width),
                    disabled: isNavActive,
                    style: [
                      styles.optionButton,
                      frameWidth === width && styles.optionButtonActive,
                      isNavActive && styles.optionButtonDisabled,
                    ],
                  },
                  React.createElement(
                    Text,
                    {
                      style: [
                        styles.optionButtonText,
                        frameWidth === width && styles.optionButtonTextActive,
                      ],
                    },
                    `${width}px`,
                  ),
                ),
              ),
            ),
          ),

          // JPEG Quality
          React.createElement(
            View,
            { style: styles.settingsRow },
            React.createElement(
              Text,
              { style: styles.settingsLabel },
              `JPEG Quality: ${(jpegQuality * 100).toFixed(0)}%`,
            ),
            React.createElement(
              View,
              { style: styles.settingsOptions },
              [0.3, 0.5, 0.7, 0.9].map((quality) =>
                React.createElement(
                  Pressable,
                  {
                    key: quality,
                    onPress: () => setJpegQuality(quality),
                    disabled: isNavActive,
                    style: [
                      styles.optionButton,
                      Math.abs(jpegQuality - quality) < 0.05 && styles.optionButtonActive,
                      isNavActive && styles.optionButtonDisabled,
                    ],
                  },
                  React.createElement(
                    Text,
                    {
                      style: [
                        styles.optionButtonText,
                        Math.abs(jpegQuality - quality) < 0.05 && styles.optionButtonTextActive,
                      ],
                    },
                    `${(quality * 100).toFixed(0)}%`,
                  ),
                ),
              ),
            ),
          ),

          // Send Frequency
          React.createElement(
            View,
            { style: styles.settingsRow },
            React.createElement(
              Text,
              { style: styles.settingsLabel },
              "Send Frequency:",
            ),
            React.createElement(
              View,
              { style: styles.settingsOptions },
              [
                { label: "0.5s", value: 500 },
                { label: "1s", value: 1000 },
                { label: "2s", value: 2000 },
                { label: "5s", value: 5000 },
              ].map(({ label, value }) =>
                React.createElement(
                  Pressable,
                  {
                    key: value,
                    onPress: () => setSendIntervalMs(value),
                    disabled: isNavActive,
                    style: [
                      styles.optionButton,
                      sendIntervalMs === value && styles.optionButtonActive,
                      isNavActive && styles.optionButtonDisabled,
                    ],
                  },
                  React.createElement(
                    Text,
                    {
                      style: [
                        styles.optionButtonText,
                        sendIntervalMs === value && styles.optionButtonTextActive,
                      ],
                    },
                    label,
                  ),
                ),
              ),
            ),
          ),
        ),

      // Error display
      lastError &&
        React.createElement(
          View,
          { style: styles.errorBox },
          React.createElement(
            Text,
            { style: styles.errorText },
            `Error: ${lastError}`,
          ),
        ),

      // Tab toggle row
      (lastSentData || lastResponse) &&
        React.createElement(
          View,
          { style: styles.tabRow },
          React.createElement(
            Pressable,
            {
              style: [styles.tab, activeTab === "sent" && styles.tabActive],
              onPress: () => setActiveTab("sent"),
              accessibilityRole: "tab",
              accessibilityState: { selected: activeTab === "sent" },
            },
            React.createElement(
              Text,
              { style: [styles.tabText, activeTab === "sent" && styles.tabTextActive] },
              "Sent Data",
            ),
          ),
          React.createElement(
            Pressable,
            {
              style: [styles.tab, activeTab === "response" && styles.tabActive],
              onPress: () => setActiveTab("response"),
              accessibilityRole: "tab",
              accessibilityState: { selected: activeTab === "response" },
            },
            React.createElement(
              Text,
              { style: [styles.tabText, activeTab === "response" && styles.tabTextActive] },
              "Response",
            ),
          ),
        ),

      // ── Sent Data tab ──
      activeTab === "sent" &&
        lastSentData &&
        React.createElement(
          View,
          { style: styles.responseBox },
          // JSON data display
          React.createElement(
            View,
            { style: styles.jsonContainer },
            formatJsonForDisplay(lastSentData),
          ),
          // Compressed frame preview — shows exactly what the backend receives (moved below)
          lastFrameUri &&
            React.createElement(Image, {
              source: { uri: lastFrameUri },
              style: styles.framePreview,
              resizeMode: "contain",
            }),
        ),

      // ── Response tab ──
      activeTab === "response" &&
        lastResponse &&
        React.createElement(
          View,
          { style: styles.responseBox },
          // JSON data display
          React.createElement(
            View,
            { style: styles.jsonContainer },
            formatJsonForDisplay(lastResponse),
          ),
        ),

      // No data yet placeholder
      activeTab === "sent" &&
        !lastSentData &&
        React.createElement(
          View,
          { style: styles.responseBox },
          React.createElement(
            View,
            { style: styles.placeholderContainer },
            React.createElement(
              Text,
              { style: styles.responseField },
              "No data sent yet. Send a frame to see sensor data here.",
            ),
          ),
        ),

      activeTab === "response" &&
        !lastResponse &&
        React.createElement(
          View,
          { style: styles.responseBox },
          React.createElement(
            View,
            { style: styles.placeholderContainer },
            React.createElement(
              Text,
              { style: styles.responseField },
              "No response received yet. Send a frame to see the response here.",
            ),
          ),
        ),
    ),
  );
}

function statusBadgeColor(status: ConnectionStatus) {
  switch (status) {
    case "connected":
      return { backgroundColor: "#22C55E" };
    case "connecting":
      return { backgroundColor: "#F59E0B" };
    case "error":
      return { backgroundColor: "#EF4444" };
    default:
      return { backgroundColor: "#6B7280" };
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.xl,
    backgroundColor: colors.background,
  },
  permissionText: {
    ...typography.body,
    textAlign: "center",
    marginBottom: spacing.lg,
    color: colors.text,
  },
  cameraContainer: {
    height: 300,
    backgroundColor: colors.background,
    position: "relative",
    paddingBottom: spacing.sm,
  },
  camera: {
    flex: 1,
  },
  statusBadge: {
    position: "absolute",
    top: spacing.sm,
    right: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 12,
  },
  statusText: {
    color: "#FFF",
    fontSize: 10,
    fontWeight: "700",
  },
  controlsContainer: {
    flex: 1,
  },
  controlsContent: {
    padding: spacing.md,
    paddingBottom: 0,
    gap: spacing.sm,
  },
  frameCounter: {
    ...typography.label,
    color: colors.textSecondary,
    textAlign: "center",
    marginBottom: spacing.xs,
  },
  buttonRow: {
    flexDirection: "row",
    gap: spacing.sm,
    alignItems: "center",
  },
  sendFrameButton: {
    flex: 0,
    minWidth: 120,
  },
  rightButtonsContainer: {
    flexDirection: "row",
    gap: spacing.sm,
    marginLeft: "auto",
  },
  iconButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  settingsButton: {
    backgroundColor: colors.secondary,
  },
  settingsButtonActive: {
    backgroundColor: colors.secondaryDark,
  },
  iconButtonActive: {
    backgroundColor: colors.danger,
  },
  iconButtonDisabled: {
    opacity: 0.5,
  },
  settingsPanel: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 8,
    padding: spacing.md,
    marginTop: spacing.sm,
    gap: spacing.md,
  },
  settingsHeader: {
    ...typography.h1,
    fontSize: 16,
    marginBottom: spacing.xs,
  },
  settingsRow: {
    gap: spacing.xs,
  },
  settingsLabel: {
    ...typography.label,
    fontSize: 14,
    color: colors.text,
  },
  settingsOptions: {
    flexDirection: "row",
    gap: spacing.xs,
    flexWrap: "wrap",
  },
  optionButton: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: 6,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.secondary,
    minWidth: 60,
    alignItems: "center",
  },
  optionButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  optionButtonDisabled: {
    opacity: 0.5,
  },
  optionButtonText: {
    ...typography.label,
    fontSize: 13,
    color: colors.text,
  },
  optionButtonTextActive: {
    color: colors.buttonPrimaryText,
  },
  errorBox: {
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
    borderRadius: 8,
    padding: spacing.sm,
  },
  errorText: {
    color: "#DC2626",
    fontSize: 13,
  },
  tabRow: {
    flexDirection: "row",
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 8,
    padding: 2,
  },
  tab: {
    flex: 1,
    paddingVertical: spacing.sm,
    alignItems: "center",
    borderRadius: 6,
  },
  tabActive: {
    backgroundColor: colors.primary,
  },
  tabText: {
    ...typography.label,
    fontWeight: "600",
    color: colors.textSecondary,
  },
  tabTextActive: {
    color: "#FFF",
  },
  framePreview: {
    width: "100%" as const,
    flexGrow: 1,
    minHeight: 200,
    borderRadius: 8,
    backgroundColor: "#000",
    marginTop: 0,
  },
  responseBox: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 8,
    padding: 0,
    gap: spacing.xs,
    flexDirection: "column",
  },
  placeholderContainer: {
    padding: spacing.md,
  },
  jsonContainer: {
    backgroundColor: "#1E1E1E",
    borderRadius: 8,
    padding: spacing.md,
    fontFamily: "monospace",
    flexGrow: 1,
    minHeight: 200,
  },
  jsonLine: {
    fontFamily: "monospace",
    fontSize: 10,
    lineHeight: 15,
    color: "#D4D4D4",
  },
  jsonKey: {
    color: "#9CDCFE",
    fontWeight: "600",
  },
  jsonString: {
    color: "#CE9178",
  },
  jsonNumber: {
    color: "#B5CEA8",
  },
  jsonBoolean: {
    color: "#569CD6",
  },
  jsonNull: {
    color: "#569CD6",
    fontStyle: "italic",
  },
  jsonPunctuation: {
    color: "#D4D4D4",
  },
  jsonDefault: {
    color: "#D4D4D4",
  },
  responseHeader: {
    ...typography.medium,
    fontWeight: "700",
    marginBottom: spacing.xs,
  },
  responseSubHeader: {
    ...typography.body,
    fontWeight: "700",
    marginTop: spacing.xs,
  },
  responseField: {
    ...typography.label,
    color: colors.textSecondary,
  },
  sensorItem: {
    ...typography.label,
    color: colors.text,
    fontFamily: "monospace",
  },
  detectionItem: {
    ...typography.body,
    color: colors.text,
    fontFamily: "monospace",
  },
  successText: {
    ...typography.body,
    color: colors.primary,
    fontWeight: "700",
  },
});
