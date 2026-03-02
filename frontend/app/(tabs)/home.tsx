import * as React from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { CameraView, useCameraPermissions } from "expo-camera";
import SearchSheet from "../../components/SearchSheet";
import type { SearchSheetRef } from "../../components/SearchSheet";
import NavigationInstructionsDropdown from "../../components/NavigationInstructionsDropdown";
import {
  LandmarkResult,
  NavigationInstruction,
  startNavigation,
  aggregateNavigationInstructions,
} from "../../services/api";
import { colors } from "../../theme/colors";
import { typography } from "../../theme/typography";
import { spacing } from "../../theme/spacing";

export default function Home() {
  const sheetRef = React.useRef<SearchSheetRef>(null);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [selectedDestination, setSelectedDestination] =
    React.useState<LandmarkResult | null>(null);
  const [navigationInstructions, setNavigationInstructions] =
    React.useState<NavigationInstruction[] | null>(null);
  const [navigationError, setNavigationError] = React.useState<string | null>(
    null,
  );
  const [navigationLoading, setNavigationLoading] = React.useState(false);

  const handleSelectDestination = React.useCallback(
    async (landmark: LandmarkResult) => {
      setSelectedDestination(landmark);
      setNavigationLoading(true);
      setNavigationError(null);

      try {
        const response = await startNavigation({
          destination: { landmark_id: String(landmark.landmark_id) },
          start_location: { node_id: "r208_door" },
        });
        setNavigationInstructions(
          aggregateNavigationInstructions(response.instructions),
        );
      } catch (err) {
        setNavigationInstructions(null);
        setNavigationError(
          err instanceof Error ? err.message : "Failed to start navigation",
        );
      } finally {
        setNavigationLoading(false);
      }
    },
    [],
  );

  const handleExitNavigation = React.useCallback(() => {
    setNavigationInstructions(null);
    setNavigationError(null);
    setSelectedDestination(null);
    sheetRef.current?.collapse?.();
  }, []);

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
          "Camera permission is required to use the home screen.",
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

      selectedDestination &&
        React.createElement(
          View,
          { style: styles.destinationBanner },
          React.createElement(
            Text,
            { style: styles.destinationFloor },
            `Floor ${selectedDestination.floor_number}`,
          ),
          React.createElement(
            Text,
            { style: styles.destinationName },
            selectedDestination.name,
          ),
        ),

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

    !navigationInstructions &&
      React.createElement(SearchSheet, {
        ref: sheetRef,
        onSelectDestination: handleSelectDestination,
      }),
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
  destinationBanner: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  destinationFloor: {
    ...typography.label,
    color: colors.buttonPrimaryText,
    marginBottom: 2,
  },
  destinationName: {
    ...typography.h3,
    color: colors.buttonPrimaryText,
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
});
