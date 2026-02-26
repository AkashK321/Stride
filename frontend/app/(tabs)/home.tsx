import * as React from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { CameraView, useCameraPermissions } from "expo-camera";
import SearchSheet from "../../components/SearchSheet";
import type { SearchSheetRef } from "../../components/SearchSheet";
import { LandmarkResult } from "../../services/api";
import { colors } from "../../theme/colors";
import { typography } from "../../theme/typography";
import { spacing } from "../../theme/spacing";

export default function Home() {
  const sheetRef = React.useRef<SearchSheetRef>(null);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [selectedDestination, setSelectedDestination] =
    React.useState<LandmarkResult | null>(null);

  const handleSelectDestination = React.useCallback(
    (landmark: LandmarkResult) => {
      setSelectedDestination(landmark);
    },
    [],
  );

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
    ),

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
});
