import * as React from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Pressable,
  PanResponder,
  Image,
  Vibration
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Speech from "expo-speech";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import NavigationInstructionsDropdown from "../../components/NavigationInstructions/NavigationInstructionsDropdown";
import { formatInstruction } from "../../components/NavigationInstructions/NavigationInstructionItem";
import {
  NavigationInstruction,
  startNavigation,
} from "../../services/api";
import {
  NavigationFrameMessage,
  NavigationSocketResponse,
  NavigationUpdateResponse,
  NavigationWebSocket,
  getWebSocketUrl,
} from "../../services/navigationWebSocket";
import { colors } from "../../theme/colors";
import { typography } from "../../theme/typography";
import { spacing } from "../../theme/spacing";
import { useHeading } from "../../hooks/useHeading";
import { useSensorData } from "../../hooks/useSensorData";
import { getFocalLengthPixels } from "../../services/focalLength";

/** After centered square crop, resize to this width (output is square, e.g. 360×360). */
const LIVE_NAV_FRAME_WIDTH = 360;

/** How often to send `action: "navigation"` on the WebSocket (live nav updates). */
const LIVE_NAV_WS_INTERVAL_MS = 1000;

function getImageSize(uri: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    Image.getSize(uri, (width, height) => resolve({ width, height }), reject);
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeNavigationInstruction(instruction: unknown): NavigationInstruction | null {
  if (!isRecord(instruction)) return null;
  const coordinates = instruction.coordinates;
  const stepType = instruction.step_type;
  const turnIntent = instruction.turn_intent;

  if (!isRecord(coordinates)) return null;
  if (stepType !== "segment" && stepType !== "arrival") return null;
  if (
    turnIntent !== null &&
    turnIntent !== "left" &&
    turnIntent !== "right" &&
    turnIntent !== "around" &&
    turnIntent !== "straight"
  ) {
    return null;
  }
  if (typeof instruction.step !== "number") return null;
  if (typeof instruction.distance_feet !== "number") return null;
  if (instruction.direction !== null && typeof instruction.direction !== "string") return null;
  if (typeof instruction.start_node_id !== "string") return null;
  if (typeof instruction.end_node_id !== "string") return null;
  if (typeof instruction.node_id !== "string") return null;
  if (typeof coordinates.x !== "number" || typeof coordinates.y !== "number") return null;
  if (instruction.heading_degrees !== null && typeof instruction.heading_degrees !== "number") {
    return null;
  }

  return {
    step: instruction.step,
    step_type: stepType,
    distance_feet: instruction.distance_feet,
    direction: instruction.direction,
    start_node_id: instruction.start_node_id,
    end_node_id: instruction.end_node_id,
    node_id: instruction.node_id,
    coordinates: {
      x: coordinates.x,
      y: coordinates.y,
    },
    heading_degrees: instruction.heading_degrees,
    turn_intent: turnIntent,
  };
}

function normalizeNavigationInstructions(instructions: unknown): NavigationInstruction[] {
  if (!Array.isArray(instructions)) return [];
  return instructions
    .map(normalizeNavigationInstruction)
    .filter((instruction): instruction is NavigationInstruction => instruction !== null);
}

function isNavigationUpdateResponse(
  response: NavigationSocketResponse,
): response is NavigationUpdateResponse {
  return response.type === "navigation_update";
}

export default function NavigationSession() {
  const params = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const cameraRef = React.useRef<CameraView>(null);
  const [navigationInstructions, setNavigationInstructions] =
    React.useState<NavigationInstruction[] | null>(null);
  const [navigationSessionId, setNavigationSessionId] = React.useState<string | null>(null);
  const [navigationError, setNavigationError] = React.useState<string | null>(
    null,
  );
  const [navigationLoading, setNavigationLoading] = React.useState(false);
  const collisionPersonDetectedRef = React.useRef(false);
  const wsRef = React.useRef<NavigationWebSocket | null>(null);
  const navLoopRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const collisionLoopRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const lastVibrationTimeRef = React.useRef(0);
  const lastIntervalRef = React.useRef(0); // 0 = Safe, 1 = Low, 2 = Med, 3 = High
  // const frameInFlightRef = React.useRef(false);
  const navFrameInFlightRef = React.useRef(false);
  const collisionFrameInFlightRef = React.useRef(false);
  const requestCounterRef = React.useRef(0);
  const [speakerMode, setSpeakerMode] = React.useState(false);
  const [currentStepIndex, setCurrentStepIndex] = React.useState(0);
  const focalLengthPixels = React.useMemo(() => getFocalLengthPixels(LIVE_NAV_FRAME_WIDTH), []);
  const { getSnapshot, start: startSensors, stop: stopSensors } = useSensorData();

  const { getAlignment } = useHeading();
  const activeInstruction = navigationInstructions?.[currentStepIndex] ?? null;
  const alignment = getAlignment(activeInstruction?.heading_degrees ?? null);

  const toggleSpeakerMode = React.useCallback(() => {
    setSpeakerMode((prev) => !prev);
  }, []);

  const handleSelectedIndexChange = React.useCallback((index: number) => {
    setCurrentStepIndex(index);
  }, []);

  const stopStreamingLoops = React.useCallback(() => {
    if (navLoopRef.current) {
      clearInterval(navLoopRef.current);
      navLoopRef.current = null;
    }
    if (collisionLoopRef.current) {
      clearInterval(collisionLoopRef.current);
      collisionLoopRef.current = null;
    }
  }, []);

  const nextRequestId = React.useCallback(() => {
    requestCounterRef.current += 1;
    return requestCounterRef.current;
  }, []);

  const captureBase64Frame = React.useCallback(async (): Promise<string | null> => {
    if (!cameraRef.current) {
      return null;
    }
    const photo = await cameraRef.current.takePictureAsync({
      quality: 0.5,
      base64: false,
      skipProcessing: true,
      shutterSound: false,
    });
    if (!photo?.uri) return null;

    const encodeOptions = {
      base64: true,
      compress: 0.4,
      format: SaveFormat.JPEG as const,
    };

    try {
      // By supplying only width, Expo automatically scales the height to preserve the full frame's aspect ratio.
      const resized = await manipulateAsync(
        photo.uri,
        [{ resize: { width: LIVE_NAV_FRAME_WIDTH } }], 
        encodeOptions,
      );
      return resized.base64 ?? null;
    } catch (e) {
      console.error("Frame manipulation failed:", e);
      return null;
    }
  }, []);

  const sendNavigationFrame = React.useCallback(async () => {
    const ws = wsRef.current;
    if (!ws || !ws.isConnected() || !navigationSessionId || navFrameInFlightRef.current) {
      return;
    }
    navFrameInFlightRef.current = true;
    try {
      const imageBase64 = await captureBase64Frame();
      if (!imageBase64) return;
      const snapshot = getSnapshot();
      const message: NavigationFrameMessage = {
        action: "navigation",
        session_id: navigationSessionId,
        image_base64: imageBase64,
        focal_length_pixels: focalLengthPixels,
        heading_degrees: snapshot.heading ?? 0,
        gps: snapshot.gps,
        distance_traveled: snapshot.distanceDeltaFeet,
        timestamp_ms: Date.now(),
        request_id: nextRequestId(),
      };
      ws.sendFrame(message);
    } catch (e) {
      setNavigationError(e instanceof Error ? e.message : "Failed to send navigation frame");
    } finally {
      navFrameInFlightRef.current = false;
    }
  }, [
    captureBase64Frame,
    focalLengthPixels,
    getSnapshot,
    navigationSessionId,
    nextRequestId,
  ]);

  const sendCollisionFrame = React.useCallback(async () => {
    const ws = wsRef.current;
    if (!ws || !ws.isConnected() || !navigationSessionId || collisionFrameInFlightRef.current) {
      return;
    }
    collisionFrameInFlightRef.current = true;
    try {
      const imageBase64 = await captureBase64Frame();
      if (!imageBase64) return;
      const snapshot = getSnapshot();
      const message: NavigationFrameMessage = {
        action: "frame",
        session_id: navigationSessionId,
        image_base64: imageBase64,
        focal_length_pixels: focalLengthPixels,
        heading_degrees: snapshot.heading,
        distance_traveled: 0,
        gps: snapshot.gps,
        timestamp_ms: Date.now(),
        request_id: nextRequestId(),
      };
      ws.sendFrame(message);
    } catch (e) {
      setNavigationError(e instanceof Error ? e.message : "Failed to send collision frame");
    } finally {
      collisionFrameInFlightRef.current = false;
    }
  }, [
    captureBase64Frame,
    focalLengthPixels,
    getSnapshot,
    navigationSessionId,
    nextRequestId,
  ]);

  const handleSocketMessage = React.useCallback((response: NavigationSocketResponse) => {
    if (isNavigationUpdateResponse(response)) {
      const remaining = normalizeNavigationInstructions(response.remaining_instructions);
      if (remaining.length > 0) {
        setNavigationInstructions(remaining);
      }
      if (typeof response.current_step === "number") {
        setCurrentStepIndex(Math.max(0, response.current_step - 1));
      }
      setNavigationError(null);
      return;
    }

    if (response.type === "navigation_error") {
      setNavigationError(response.error || response.message || "Live navigation update failed");
      return;
    }

    if (Array.isArray(response.estimatedDistances) && response.estimatedDistances.length > 0) {
      
      console.log("Received collision update with distances (meters):", response.estimatedDistances);
      // The backend returns distances in meters, convert to feet and find the closest object
      const distancesInMeters = response.estimatedDistances.map((entry) => parseFloat(entry.distance));
      const minDistanceMeters = Math.min(...distancesInMeters);

      const minDistanceFeet = minDistanceMeters * 3.28084;

      let currentInterval = 0; 
      if (minDistanceFeet < 5) currentInterval = 3;
      else if (minDistanceFeet < 10) currentInterval = 2;
      else if (minDistanceFeet <= 20) currentInterval = 1;

      const now = Date.now();
      const timeSinceLast = now - lastVibrationTimeRef.current;
      
      console.log(`Closest object at ${minDistanceFeet.toFixed(1)} ft, interval ${currentInterval}, time since last vibration ${timeSinceLast} ms`);
      if (currentInterval > 0) {
        // TRIGGER RULE:
        // 1. If danger escalated (e.g. Low -> High), vibrate immediately to warn the user.
        // 2. If danger is the same/lower, wait for the previous pattern to fully finish (500ms frame cycle).
        if (currentInterval > lastIntervalRef.current || timeSinceLast >= 500) {
          
          if (currentInterval === 3) {
            // [0-5) ft: High danger - 3 rapid buzzes
            // Duration: 100+40+100+40+100 = 380ms (Leaves 120ms of silence before next frame)
            Vibration.vibrate([0, 100, 40, 100, 40, 100]);
          } else if (currentInterval === 2) {
            // [5-10) ft: Medium warning - 2 moderate buzzes
            // Duration: 150+100+150 = 400ms (Leaves 100ms of silence before next frame)
            Vibration.vibrate([0, 150, 100, 150]);
          } else if (currentInterval === 1) {
            // [10-20] ft: Low alert - 1 long pulse
            // Duration: 400ms (Leaves 100ms of silence before next frame)
            Vibration.vibrate(400);
          }

          lastVibrationTimeRef.current = now;
          lastIntervalRef.current = currentInterval;
        }
      } else {
        lastIntervalRef.current = 0; // Reset to safe
      }
    } else {
      lastIntervalRef.current = 0; // Reset if no objects detected in frame
    }
  }, []);

  /** Always latest send fns so WebSocket intervals do not need effect re-runs when sensors/state change. */
  const sendNavigationFrameRef = React.useRef(sendNavigationFrame);
  const sendCollisionFrameRef = React.useRef(sendCollisionFrame);
  sendNavigationFrameRef.current = sendNavigationFrame;
  sendCollisionFrameRef.current = sendCollisionFrame;

  const handleSocketMessageRef = React.useRef(handleSocketMessage);
  handleSocketMessageRef.current = handleSocketMessage;

  const startSensorsRef = React.useRef(startSensors);
  const stopSensorsRef = React.useRef(stopSensors);
  startSensorsRef.current = startSensors;
  stopSensorsRef.current = stopSensors;

  const instructionCountRef = React.useRef(0);
  instructionCountRef.current = navigationInstructions?.length ?? 0;

  const panResponder = React.useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        const { dx } = gestureState;
        return Math.abs(dx) > 25;
      },
      onPanResponderRelease: (_, gestureState) => {
        const { dx } = gestureState;
        const SWIPE_THRESHOLD = 50;
        const count = instructionCountRef.current;
        if (count <= 0) return;
        setCurrentStepIndex((prev) => {
          if (dx > SWIPE_THRESHOLD) {
            return Math.max(0, prev - 1);
          }
          if (dx < -SWIPE_THRESHOLD) {
            return Math.min(count - 1, prev + 1);
          }
          return prev;
        });
      },
    }),
  ).current;

  // Reset selected step when the instruction list is replaced (e.g. from API or later from WebSocket).
  React.useEffect(() => {
    setCurrentStepIndex(0);
  }, [navigationInstructions]);

  // Speak whenever the selected instruction changes (from dropdown, or later from other sources).
  React.useEffect(() => {
    if (!speakerMode || !navigationInstructions || navigationInstructions.length === 0) {
      return;
    }
    const safeIndex = Math.max(0, Math.min(currentStepIndex, navigationInstructions.length - 1));
    const current = navigationInstructions[safeIndex];
    const text = formatInstruction(current);
    console.log("[NavigationSession] Speaking instruction:", text);
    Speech.speak(text, { language: "en" });
    return () => {
      Speech.stop();
    };
  }, [speakerMode, navigationInstructions, currentStepIndex]);

  React.useEffect(() => {
    if (!speakerMode) {
      Speech.stop();
    }
  }, [speakerMode]);

  // Kick off navigation when the screen mounts
  React.useEffect(() => {
    if (!params.landmark_id) {
      setNavigationError("No destination provided.");
      return;
    }

    let cancelled = false;

    const run = async () => {
      setNavigationLoading(true);
      setNavigationError(null);
      try {
        const response = await startNavigation({
          destination: { landmark_id: String(params.landmark_id) },
          start_location: { node_id: "r208_door" },
        });
        if (cancelled) return;
        const normalizedInstructions = normalizeNavigationInstructions(response.instructions);
        if (normalizedInstructions.length === 0) {
          throw new Error("Navigation response contained no valid instructions");
        }
        setNavigationSessionId(response.session_id);
        setNavigationInstructions(normalizedInstructions);
      } catch (err) {
        if (cancelled) return;
        setNavigationInstructions(null);
        setNavigationError(
          err instanceof Error ? err.message : "Failed to start navigation",
        );
      } finally {
        if (!cancelled) {
          setNavigationLoading(false);
        }
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [params.landmark_id]);

  // WebSocket + loops: run only when session id appears or changes — not when send callbacks
  // or sensorsActive change (that was causing disconnect/reconnect churn).
  React.useEffect(() => {
    if (!navigationSessionId) {
      return;
    }

    let cancelled = false;

    const run = async () => {
      try {
        const wsUrl = getWebSocketUrl();
        if (!wsUrl) {
          setNavigationError("WebSocket URL is not configured");
          return;
        }
        const ws = new NavigationWebSocket(wsUrl);
        ws.autoReconnect = true;
        ws.setStatusHandler((status) => {
          if (status === "error") {
            setNavigationError("WebSocket connection error");
          }
        });
        ws.setMessageHandler((response) => {
          handleSocketMessageRef.current(response);
        });
        wsRef.current = ws;
        await ws.connect();
        if (cancelled) return;

        await startSensorsRef.current();
        if (cancelled) return;

        navLoopRef.current = setInterval(() => {
          void sendNavigationFrameRef.current();
        }, LIVE_NAV_WS_INTERVAL_MS);
        collisionLoopRef.current = setInterval(() => {
          void sendCollisionFrameRef.current();
        }, 500);

        void sendNavigationFrameRef.current();
        void sendCollisionFrameRef.current();
      } catch (e) {
        if (!cancelled) {
          setNavigationError(
            e instanceof Error ? e.message : "Failed to initialize live streaming",
          );
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
      stopStreamingLoops();
      wsRef.current?.disconnect();
      wsRef.current = null;
      stopSensorsRef.current();
    };
  }, [navigationSessionId, stopStreamingLoops]);

  const handleExitNavigation = React.useCallback(() => {
    stopStreamingLoops();
    wsRef.current?.disconnect();
    wsRef.current = null;
    stopSensors();
    router.back();
  }, [stopSensors, stopStreamingLoops]);

  const totalDistanceFeet = React.useMemo(() => {
    if (!navigationInstructions || navigationInstructions.length === 0) {
      return null;
    }
    const rawTotal = navigationInstructions.reduce(
      (sum, inst) => sum + inst.distance_feet,
      0,
    );
    return Math.round(rawTotal / 5) * 5;
  }, [navigationInstructions]);

  if (!cameraPermission) {
    return React.createElement(
      View,
      { style: styles.centered },
      React.createElement(ActivityIndicator, {
        size: "large",
        color: colors.primary,
      }),
    );
  }

  if (!cameraPermission.granted) {
    return React.createElement(
      GestureHandlerRootView,
      { style: styles.root },
      React.createElement(
        View,
        { style: styles.centered },
        React.createElement(
          Text,
          { style: styles.permissionText },
          "Camera permission is required to use navigation.",
        ),
        React.createElement(
          Text,
          {
            style: styles.permissionLink,
            onPress: requestCameraPermission,
          },
          "Grant Camera Permission",
        ),
      ),
    );
  }

  return React.createElement(
    GestureHandlerRootView,
    { style: styles.root },

    React.createElement(CameraView, {
      ref: cameraRef,
      style: StyleSheet.absoluteFill,
      facing: "back",
    }),

    React.createElement(
      SafeAreaView,
      {
        style: styles.overlay,
        edges: ["top"] as const,
      },
      React.createElement(
        View,
        {
          style: styles.swipeableOverlay,
          ...(navigationInstructions && navigationInstructions.length > 0
            ? panResponder.panHandlers
            : {}),
        },
        navigationLoading &&
          React.createElement(
            View,
            { style: styles.loadingBanner },
            React.createElement(ActivityIndicator, {
              size: "small",
              color: colors.buttonPrimaryText,
            }),
            React.createElement(
              Text,
              { style: styles.loadingText },
              "Calculating route…",
            ),
          ),

        navigationError &&
          React.createElement(
            View,
            { style: styles.errorBanner },
            React.createElement(
              Text,
              { style: styles.errorText },
              navigationError,
            ),
          ),

        navigationInstructions &&
          React.createElement(NavigationInstructionsDropdown, {
            instructions: navigationInstructions,
            onExit: handleExitNavigation,
            selectedIndex: currentStepIndex,
            onSelectedIndexChange: handleSelectedIndexChange,
          }),
      ),
    ),

    params.name &&
      navigationInstructions &&
      React.createElement(
        View,
        { style: styles.bottomNavContainer },
        React.createElement(
          View,
          { style: styles.speakerButtonRow },
          React.createElement(
            Pressable,
            {
              style: styles.speakerButton,
              onPress: toggleSpeakerMode,
              accessibilityRole: "button",
              accessibilityLabel: speakerMode ? "Speaker on, tap to turn off" : "Speaker off, tap to turn on",
            },
            React.createElement(Ionicons, {
              name: speakerMode ? "volume-high" : "volume-mute-outline",
              size: 28,
              color: speakerMode ? colors.primary : colors.textSecondary,
            }),
          ),
        ),
        React.createElement(
          View,
          {
            style: [
              styles.bottomNavBar,
              { paddingBottom: insets.bottom || spacing.sm },
            ],
          },
          React.createElement(
            View,
            { style: styles.bottomNavTextContainer },
            React.createElement(
              Text,
              { style: styles.bottomNavDestination, numberOfLines: 1 },
              params.name,
            ),
            totalDistanceFeet !== null &&
              React.createElement(
                Text,
                { style: styles.bottomNavDistance },
                `${totalDistanceFeet} ft`,
              ),
            // Alignment indicator — shows when heading_degrees is available on the active instruction.
            // Hidden on the final "arrive" step (heading_degrees is null) and before instructions load.
            alignment !== "unknown" &&
              React.createElement(
                View,
                { style: styles.alignmentRow },
                React.createElement(Ionicons, {
                  name:
                    alignment === "aligned"
                      ? "checkmark-circle"
                      : alignment === "turn_left"
                      ? "arrow-back-circle"
                      : "arrow-forward-circle",
                  size: 20,
                  color: alignment === "aligned" ? colors.primary : colors.textSecondary,
                }),
                React.createElement(
                  Text,
                  { style: styles.alignmentText },
                  alignment === "aligned"
                    ? "Facing the right way"
                    : alignment === "turn_left"
                    ? "Turn left"
                    : "Turn right",
                ),
              ),
          ),
          React.createElement(
            Pressable,
            {
              style: styles.bottomNavEndButton,
              onPress: handleExitNavigation,
              accessibilityRole: "button",
              accessibilityLabel: "End navigation",
            },
            React.createElement(
              Text,
              { style: styles.bottomNavEndButtonText },
              "End navigation",
            ),
          ),
        ),
      ),
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#000",
  },
  overlay: {
    flex: 1,
  },
  swipeableOverlay: {
    flex: 1,
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
    marginBottom: spacing.md,
    color: colors.text,
  },
  permissionLink: {
    ...typography.body,
    color: colors.primary,
    fontWeight: "700",
  },
  loadingBanner: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.secondary,
  },
  loadingText: {
    ...typography.label,
    color: colors.buttonPrimaryText,
    marginLeft: spacing.sm,
  },
  errorBanner: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: "#FEF2F2",
  },
  errorText: {
    ...typography.label,
    color: colors.danger,
  },
  bottomNavContainer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    width: "100%",
  },
  speakerButtonRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  speakerButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.background,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.backgroundSecondary,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  bottomNavBar: {
    flexDirection: "column",
    alignItems: "stretch",
    alignSelf: "stretch",
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    backgroundColor: colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: "hidden",
  },
  bottomNavTextContainer: {
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  bottomNavDestination: {
    ...typography.h3,
    fontSize: 22,
    color: colors.text,
  },
  bottomNavDistance: {
    ...typography.label,
    marginTop: 4,
    fontSize: 18,
    color: colors.textSecondary,
  },
  alignmentRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 6,
    gap: 6,
  },
  alignmentText: {
    ...typography.label,
    fontSize: 15,
    color: colors.textSecondary,
  },
  bottomNavEndButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: 16,
    alignItems: "center",
    alignSelf: "stretch",
    backgroundColor: colors.danger,
  },
  bottomNavEndButtonText: {
    ...typography.button,
    fontSize: 16,
    color: colors.buttonPrimaryText,
  },
});