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
  NavigationFrameMetadata,
  NavigationResponse,
  nextNavigationRequestId,
  sendNavigationFrameHttp,
} from "../../services/navigationHttp";
import { colors } from "../../theme/colors";
import { typography } from "../../theme/typography";
import { spacing } from "../../theme/spacing";
import { useHeading } from "../../hooks/useHeading";
import { useSensorData } from "../../hooks/useSensorData";
import { getFocalLengthPixels } from "../../services/focalLength";

/** After centered square crop, resize to this width (output is square, e.g. 360×360). */
const LIVE_NAV_FRAME_WIDTH = 360;

/** How often to send navigation frame updates over HTTP. */
const LIVE_NAV_HTTP_INTERVAL_MS = 1000;

function getImageSize(uri: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    Image.getSize(uri, (width, height) => resolve({ width, height }), reject);
  });
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
  const navLoopRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const navFrameInFlightRef = React.useRef(false);
  const [speakerMode, setSpeakerMode] = React.useState(false);
  const [currentStepIndex, setCurrentStepIndex] = React.useState(0);
  const focalLengthPixels = React.useMemo(() => getFocalLengthPixels(LIVE_NAV_FRAME_WIDTH), []);
  const { getSnapshot, start: startSensors, stop: stopSensors } = useSensorData();

  const { getAlignment } = useHeading();
  const activeInstruction = navigationInstructions?.[currentStepIndex] ?? null;
  // const alignment = getAlignment(activeInstruction?.heading_degrees ?? null);
  const alignment = getAlignment(270); // mock "face west"

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
  }, []);

  const captureFrameUri = React.useCallback(async (): Promise<string | null> => {
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
      return resized.uri;
    } catch (e) {
      console.error("Frame manipulation failed:", e);
      return null;
    }
  }, []);

  const sendNavigationFrame = React.useCallback(async () => {
    if (!navigationSessionId || navFrameInFlightRef.current) {
      return;
    }
    navFrameInFlightRef.current = true;
    try {
      const imageUri = await captureFrameUri();
      if (!imageUri) return;
      const snapshot = getSnapshot();
      const metadata: NavigationFrameMetadata = {
        session_id: navigationSessionId,
        focal_length_pixels: focalLengthPixels,
        heading_degrees: snapshot.heading ?? 0,
        gps: snapshot.gps,
        distance_traveled: snapshot.distanceDeltaFeet,
        timestamp_ms: Date.now(),
        request_id: nextNavigationRequestId(),
      };
      const response = await sendNavigationFrameHttp(imageUri, metadata);
      handleSocketMessage(response);
    } catch (e) {
      setNavigationError(e instanceof Error ? e.message : "Failed to send navigation frame");
    } finally {
      navFrameInFlightRef.current = false;
    }
  }, [
    captureFrameUri,
    focalLengthPixels,
    getSnapshot,
    navigationSessionId
  ]);

  const handleSocketMessage = React.useCallback((response: NavigationResponse) => {
    if (response.type === "navigation_update") {
      const remaining = response.remaining_instructions as NavigationInstruction[] | undefined;
      if (Array.isArray(remaining) && remaining.length > 0) {
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

  }, []);

  /** Always latest send fns so WebSocket intervals do not need effect re-runs when sensors/state change. */
  const sendNavigationFrameRef = React.useRef(sendNavigationFrame);
  sendNavigationFrameRef.current = sendNavigationFrame;

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

  // Reset selected step when the instruction list is replaced.
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
        // Use instructions exactly as returned from the backend
        setNavigationSessionId(response.session_id);
        setNavigationInstructions(response.instructions);
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

  // Start HTTP navigation loop once session id is available.
  React.useEffect(() => {
    if (!navigationSessionId) {
      return;
    }

    let cancelled = false;

    const run = async () => {
      try {
        await startSensorsRef.current();
        if (cancelled) return;

        navLoopRef.current = setInterval(() => {
          void sendNavigationFrameRef.current();
        }, LIVE_NAV_HTTP_INTERVAL_MS);

        void sendNavigationFrameRef.current();
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
      Vibration.cancel();
      stopSensorsRef.current();
    };
  }, [navigationSessionId, stopStreamingLoops]);

  const handleExitNavigation = React.useCallback(() => {
    stopStreamingLoops();
    Vibration.cancel();
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