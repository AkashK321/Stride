/**
 * Navigation screen — camera frame capture and transmission to the backend.
 *
 * Provides two modes:
 * 1. Manual Frame — capture a single photo, attach sensor data, send via WebSocket
 * 2. Navigation Mode — continuous loop capturing and sending every 2 seconds
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
import * as MediaLibrary from "expo-media-library";

/** Interval for continuous navigation mode (ms) */
const NAV_LOOP_INTERVAL_MS = 2000;

/**
 * Max width for frames sent over WebSocket.
 *
 * API Gateway WebSocket default payload quota is 32 KB (can be increased
 * to 128 KB via AWS Service Quotas). After base64 encoding (+33%) and
 * JSON metadata (~3 KB), the raw JPEG must stay under ~21 KB.
 *
 * 480px wide at JPEG quality 0.5 produces ~15–22 KB — close to the limit
 * while preserving more detail. YOLOv11 resizes to 640×640 internally.
 */
const MAX_FRAME_WIDTH = 360;
const FRAME_JPEG_COMPRESS = 0.4;

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
  const captureAndSend = async () => {
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

      // Resize to MAX_FRAME_WIDTH to stay under API Gateway's 32 KB WS payload limit.
      // YOLOv11 resizes to 640×640 internally, so detection quality is preserved.
      const resized = await manipulateAsync(
        photo.uri,
        [{ resize: { width: MAX_FRAME_WIDTH } }],
        { base64: true, compress: FRAME_JPEG_COMPRESS, format: SaveFormat.JPEG },
      );

      if (!resized.base64) {
        setLastError("Failed to resize photo — no base64 data");
        return;
      }

      // Store the compressed frame URI for in-app preview
      setLastFrameUri(resized.uri);

      // Save compressed frame to camera roll for inspection
      try {
        const { status } = await MediaLibrary.requestPermissionsAsync();
        if (status === "granted") {
          await MediaLibrary.saveToLibraryAsync(resized.uri);
        }
      } catch (e) {
        console.warn("Failed to save frame to camera roll:", e);
      }

      // Get current sensor readings
      const sensors = getSnapshot();

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
      } else {
        setLastError("Failed to send frame via WebSocket");
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Capture failed";
      setLastError(msg);
      console.error("Frame capture error:", e);
    } finally {
      setIsSending(false);
    }
  };

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
    setFrameCount(0);
    setLastError(null);

    // Send first frame immediately
    await captureAndSend();

    // Then start the interval
    navIntervalRef.current = setInterval(async () => {
      await captureAndSend();
    }, NAV_LOOP_INTERVAL_MS);
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
      { style: styles.centered, edges: ["top", "bottom"] as const },
      React.createElement(ActivityIndicator, { size: "large", color: colors.primary }),
    );
  }

  if (!cameraPermission.granted) {
    return React.createElement(
      SafeAreaView,
      { style: styles.centered, edges: ["top", "bottom"] as const },
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
    { style: styles.container, edges: ["top", "bottom"] as const },

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
        `Frames sent: ${frameCount}  |  Focal: ${focalLengthPixels}px`,
      ),

      // Buttons row
      React.createElement(
        View,
        { style: styles.buttonRow },

        // Send Frame button
        React.createElement(Button, {
          onPress: handleSendFrame,
          title: "Send Frame",
          disabled: isSending || isNavActive,
          loading: isSending && !isNavActive,
          style: styles.button,
          accessibilityLabel: "Send a single camera frame",
          accessibilityRole: "button",
          accessibilityHint: "Captures a photo and sends it to the backend with sensor data",
        }),

        // Start/Stop Navigation button
        React.createElement(Button, {
          onPress: handleToggleNav,
          title: isNavActive ? "Stop Periodic Frame" : "Send Periodic Frame",
          variant: isNavActive ? "danger" : "primary",
          disabled: isSending && !isNavActive,
          style: styles.button,
          accessibilityLabel: isNavActive
            ? "Stop continuous navigation"
            : "Start continuous navigation",
          accessibilityRole: "button",
          accessibilityHint: isNavActive
            ? "Stops the automatic frame capture loop"
            : "Starts capturing and sending frames every 2 seconds",
        }),
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

          // Header
          React.createElement(
            Text,
            { style: styles.responseHeader },
            "Last Sent Packet",
          ),

          // Compressed frame preview — shows exactly what the backend receives
          lastFrameUri &&
            React.createElement(Image, {
              source: { uri: lastFrameUri },
              style: styles.framePreview,
              resizeMode: "contain",
            }),

          // Meta
          React.createElement(
            Text,
            { style: styles.responseField },
            `Session: ${lastSentData.session_id}  |  Image: ~${(lastSentData.image_size_bytes / 1024).toFixed(1)} KB`,
          ),
          React.createElement(
            Text,
            { style: styles.responseField },
            `Timestamp: ${new Date(lastSentData.timestamp_ms).toLocaleTimeString()}`,
          ),
          React.createElement(
            Text,
            { style: styles.responseField },
            `Focal length: ${lastSentData.focal_length_pixels}px`,
          ),

          // GPS
          React.createElement(
            Text,
            { style: styles.responseSubHeader },
            "GPS",
          ),
          lastSentData.gps
            ? React.createElement(
                View,
                null,
                React.createElement(
                  Text,
                  { style: styles.sensorItem },
                  `  Lat: ${lastSentData.gps.latitude.toFixed(6)}`,
                ),
                React.createElement(
                  Text,
                  { style: styles.sensorItem },
                  `  Lng: ${lastSentData.gps.longitude.toFixed(6)}`,
                ),
                React.createElement(
                  Text,
                  { style: styles.sensorItem },
                  `  Alt: ${lastSentData.gps.altitude?.toFixed(1) ?? "N/A"}m  |  Acc: ${lastSentData.gps.accuracy?.toFixed(1) ?? "N/A"}m`,
                ),
                React.createElement(
                  Text,
                  { style: styles.sensorItem },
                  `  Speed: ${lastSentData.gps.speed?.toFixed(2) ?? "N/A"} m/s`,
                ),
              )
            : React.createElement(
                Text,
                { style: styles.responseField },
                "  Not available",
              ),

          // Heading
          React.createElement(
            Text,
            { style: styles.responseSubHeader },
            "Heading",
          ),
          React.createElement(
            Text,
            { style: styles.sensorItem },
            `  ${lastSentData.heading_degrees != null ? `${lastSentData.heading_degrees.toFixed(1)}°` : "Not available"}`,
          ),

          // Accelerometer
          React.createElement(
            Text,
            { style: styles.responseSubHeader },
            "Accelerometer (G-force)",
          ),
          lastSentData.accelerometer
            ? React.createElement(
                Text,
                { style: styles.sensorItem },
                `  x: ${lastSentData.accelerometer.x.toFixed(3)}  y: ${lastSentData.accelerometer.y.toFixed(3)}  z: ${lastSentData.accelerometer.z.toFixed(3)}`,
              )
            : React.createElement(
                Text,
                { style: styles.responseField },
                "  Not available",
              ),

          // Gyroscope
          React.createElement(
            Text,
            { style: styles.responseSubHeader },
            "Gyroscope (rad/s)",
          ),
          lastSentData.gyroscope
            ? React.createElement(
                Text,
                { style: styles.sensorItem },
                `  x: ${lastSentData.gyroscope.x.toFixed(3)}  y: ${lastSentData.gyroscope.y.toFixed(3)}  z: ${lastSentData.gyroscope.z.toFixed(3)}`,
              )
            : React.createElement(
                Text,
                { style: styles.responseField },
                "  Not available",
              ),
        ),

      // ── Response tab ──
      activeTab === "response" &&
        lastResponse &&
        React.createElement(
          View,
          { style: styles.responseBox },
          React.createElement(
            Text,
            { style: styles.responseHeader },
            "Latest Response",
          ),

          // Show detection results
          lastResponse.valid !== undefined &&
            React.createElement(
              Text,
              { style: styles.responseField },
              `Valid: ${lastResponse.valid}  |  Frame size: ${lastResponse.frameSize ?? "N/A"} bytes`,
            ),

          // Estimated distances
          lastResponse.estimatedDistances &&
            lastResponse.estimatedDistances.length > 0 &&
            React.createElement(
              View,
              null,
              React.createElement(
                Text,
                { style: styles.responseSubHeader },
                `Detections (${lastResponse.estimatedDistances.length}):`,
              ),
              ...lastResponse.estimatedDistances.map((det, i) =>
                React.createElement(
                  Text,
                  { key: `det-${i}`, style: styles.detectionItem },
                  `  ${det.className ?? "unknown"}: ${det.distance ?? "?"}m`,
                ),
              ),
            ),

          // No detections
          lastResponse.estimatedDistances &&
            lastResponse.estimatedDistances.length === 0 &&
            React.createElement(
              Text,
              { style: styles.responseField },
              "No objects detected",
            ),

          // Navigation-specific responses
          lastResponse.type === "navigation_complete" &&
            React.createElement(
              Text,
              { style: styles.successText },
              lastResponse.message || "Navigation complete!",
            ),

          // Raw JSON fallback
          !lastResponse.estimatedDistances &&
            !lastResponse.type &&
            React.createElement(
              Text,
              { style: styles.responseField },
              JSON.stringify(lastResponse, null, 2),
            ),
        ),

      // No data yet placeholder
      activeTab === "sent" &&
        !lastSentData &&
        React.createElement(
          View,
          { style: styles.responseBox },
          React.createElement(
            Text,
            { style: styles.responseField },
            "No data sent yet. Send a frame to see sensor data here.",
          ),
        ),

      activeTab === "response" &&
        !lastResponse &&
        React.createElement(
          View,
          { style: styles.responseBox },
          React.createElement(
            Text,
            { style: styles.responseField },
            "No response received yet. Send a frame to see the response here.",
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
    backgroundColor: "#000",
    position: "relative",
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
  },
  button: {
    flex: 1,
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
    height: 180,
    borderRadius: 6,
    backgroundColor: "#000",
    marginBottom: spacing.sm,
  },
  responseBox: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 8,
    padding: spacing.md,
    gap: spacing.xs,
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
