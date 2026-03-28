import * as React from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Pressable,
  PanResponder,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Speech from "expo-speech";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import NavigationInstructionsDropdown from "../../components/NavigationInstructions/NavigationInstructionsDropdown";
import { formatInstruction } from "../../components/NavigationInstructions/NavigationInstructionItem";
import {
  NavigationInstruction,
  startNavigation,
} from "../../services/api";
import { colors } from "../../theme/colors";
import { typography } from "../../theme/typography";
import { spacing } from "../../theme/spacing";
import { useHeading } from "../../hooks/useHeading";


export default function NavigationSession() {
  const params = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [navigationInstructions, setNavigationInstructions] =
    React.useState<NavigationInstruction[] | null>(null);
  const [navigationError, setNavigationError] = React.useState<string | null>(
    null,
  );
  const [navigationLoading, setNavigationLoading] = React.useState(false);
  const [speakerMode, setSpeakerMode] = React.useState(false);
  const [currentStepIndex, setCurrentStepIndex] = React.useState(0);

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
        // Use instructions exactly as returned from the backend
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

  const handleExitNavigation = React.useCallback(() => {
    router.back();
  }, []);

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