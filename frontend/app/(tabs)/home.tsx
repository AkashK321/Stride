import * as React from "react";
import { View, Text, StyleSheet, ActivityIndicator, Pressable } from "react-native";
import { useNavigation, router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Speech from "expo-speech";
import { Ionicons } from "@expo/vector-icons";
import SearchSheet from "../../components/SearchSheet";
import type { SearchSheetRef } from "../../components/SearchSheet";
import NavigationInstructionsDropdown from "../../components/NavigationInstructions/NavigationInstructionsDropdown";
import { formatInstruction } from "../../components/NavigationInstructions/NavigationInstructionItem";
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
  const navigation = useNavigation();
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [selectedDestination, setSelectedDestination] =
    React.useState<LandmarkResult | null>(null);
  const [navigationInstructions, setNavigationInstructions] =
    React.useState<NavigationInstruction[] | null>(null);
  const [navigationError, setNavigationError] = React.useState<string | null>(
    null,
  );
  const [navigationLoading, setNavigationLoading] = React.useState(false);
  const [speakerMode, setSpeakerMode] = React.useState(false);
  const lastSpokenTextRef = React.useRef<string | null>(null);

  const toggleSpeakerMode = React.useCallback(() => {
    setSpeakerMode((prev) => !prev);
  }, []);

  React.useEffect(() => {
    if (!speakerMode || !navigationInstructions || navigationInstructions.length === 0) {
      return;
    }
    const current = navigationInstructions[0];
    const next = navigationInstructions[1] ?? null;
    const text = formatInstruction(current, next);
    if (text === lastSpokenTextRef.current) {
      return;
    }
    lastSpokenTextRef.current = text;
    Speech.speak(text, { language: "en" });
    return () => {
      Speech.stop();
    };
  }, [speakerMode, navigationInstructions]);

  React.useEffect(() => {
    if (!speakerMode) {
      lastSpokenTextRef.current = null;
      Speech.stop();
    }
  }, [speakerMode]);

  const handleSelectDestination = React.useCallback(
    (landmark: LandmarkResult) => {
      router.push({
        pathname: "/navigation/navigation",
        params: {
          landmark_id: String(landmark.landmark_id),
          name: landmark.name,
          floor_number: String(landmark.floor_number),
        },
      });
    },
    [],
  );

  const handleExitNavigation = React.useCallback(() => {
    setNavigationInstructions(null);
    setNavigationError(null);
    setSelectedDestination(null);
    sheetRef.current?.collapse?.();
  }, []);

  React.useEffect(() => {
    const parent = navigation.getParent?.();
    if (!parent) {
      return;
    }

    if (navigationInstructions && navigationInstructions.length > 0) {
      parent.setOptions({
        tabBarStyle: { display: "none" },
      });
    } else {
      // Restore default tab bar style from layout by clearing override
      parent.setOptions({
        tabBarStyle: undefined,
      });
    }
  }, [navigation, navigationInstructions]);

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
          // style: styles.navigationInstructionsDropdown,
        }),
    ),

    selectedDestination &&
      navigationInstructions &&
      React.createElement(
        View,
        { style: styles.bottomNavContainer },
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
        React.createElement(
          View,
          { style: styles.bottomNavBar },
          React.createElement(
            View,
            { style: styles.bottomNavTextContainer },
            React.createElement(
              Text,
              { style: styles.bottomNavDestination },
              selectedDestination.name,
            ),
            totalDistanceFeet !== null &&
              React.createElement(
                Text,
                { style: styles.bottomNavDistance },
                `${totalDistanceFeet} ft remaining`,
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
              "End",
            ),
          ),
        ),
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
    alignItems: "center",
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
    marginBottom: spacing.sm,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  bottomNavBar: {
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.backgroundSecondary,
  },
  bottomNavTextContainer: {
    flex: 1,
    marginRight: spacing.sm,
  },
  bottomNavDestination: {
    ...typography.h3,
    fontSize: 18,
    color: colors.text,
  },
  bottomNavDistance: {
    ...typography.label,
    marginTop: 2,
    color: colors.textSecondary,
  },
  bottomNavEndButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 999,
    backgroundColor: colors.danger,
  },
  bottomNavEndButtonText: {
    ...typography.button,
    color: colors.buttonPrimaryText,
  },
});
