import * as React from "react";
import { View, Text, StyleSheet, ActivityIndicator, Pressable } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { CameraView, useCameraPermissions } from "expo-camera";
import { router, useLocalSearchParams } from "expo-router";
import NavigationInstructionsDropdown from "../../components/NavigationInstructions/NavigationInstructionsDropdown";
import {
  NavigationInstruction,
  startNavigation,
  aggregateNavigationInstructions,
} from "../../services/api";
import { colors } from "../../theme/colors";
import { typography } from "../../theme/typography";
import { spacing } from "../../theme/spacing";


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
        setNavigationInstructions(
          aggregateNavigationInstructions(response.instructions),
        );
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
        }),
    ),

    params.name &&
      navigationInstructions &&
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
  bottomNavBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "column",
    alignItems: "stretch",
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

