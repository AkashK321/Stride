import * as React from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import SearchInput from "../../components/SearchSheet/SearchInput";
import SearchResultItem from "../../components/SearchSheet/SearchResultItem";
import { searchLandmarks, type LandmarkResult } from "../../services/api";
import { colors } from "../../theme/colors";
import { radii } from "../../theme/radius";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";

const DEBOUNCE_MS = 300;
const QUICK_ACTIONS = [
  { id: "restroom", label: "Restrooms", query: "restroom", icon: "water-outline" },
  { id: "elevator", label: "Elevators", query: "elevator", icon: "swap-vertical-outline" },
  { id: "exit", label: "Exit", query: "exit", icon: "exit-outline" },
] as const;

type PickerContext = "start" | "destination";

export default function Home() {
  const [selectedStart, setSelectedStart] = React.useState<LandmarkResult | null>(null);
  const [selectedDestination, setSelectedDestination] = React.useState<LandmarkResult | null>(null);
  const [recentDestinations, setRecentDestinations] = React.useState<LandmarkResult[]>([]);
  const [pickerVisible, setPickerVisible] = React.useState(false);
  const [pickerContext, setPickerContext] = React.useState<PickerContext>("destination");
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<LandmarkResult[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [searched, setSearched] = React.useState(false);
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const performSearch = React.useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) {
      setResults([]);
      setError(null);
      setSearched(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await searchLandmarks(trimmed);
      setResults(response.results);
      setSearched(true);
    } catch (searchError) {
      setResults([]);
      setSearched(true);
      setError(
        searchError instanceof Error ? searchError.message : "Failed to search landmarks.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  const updateRecentDestinations = React.useCallback((landmark: LandmarkResult) => {
    setRecentDestinations((current) => {
      const withoutCurrent = current.filter(
        (item) => item.landmark_id !== landmark.landmark_id,
      );
      return [landmark, ...withoutCurrent].slice(0, 10);
    });
  }, []);

  const closePicker = React.useCallback(() => {
    setPickerVisible(false);
    setQuery("");
    setResults([]);
    setError(null);
    setSearched(false);
  }, []);

  const openPicker = React.useCallback(
    (context: PickerContext, presetQuery?: string) => {
      setPickerContext(context);
      setPickerVisible(true);
      const nextQuery = presetQuery ?? "";
      setQuery(nextQuery);
      setError(null);

      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }

      if (nextQuery.trim().length > 0) {
        void performSearch(nextQuery);
      } else {
        setResults([]);
        setSearched(false);
      }
    },
    [performSearch],
  );

  const handleQueryChange = React.useCallback(
    (text: string) => {
      setQuery(text);
      setError(null);

      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }

      if (text.trim().length === 0) {
        setResults([]);
        setSearched(false);
        return;
      }

      debounceRef.current = setTimeout(() => {
        void performSearch(text);
      }, DEBOUNCE_MS);
    },
    [performSearch],
  );

  const handleSelectLandmark = React.useCallback(
    (landmark: LandmarkResult) => {
      if (pickerContext === "start") {
        setSelectedStart(landmark);
      } else {
        setSelectedDestination(landmark);
        updateRecentDestinations(landmark);
      }
      closePicker();
    },
    [closePicker, pickerContext, updateRecentDestinations],
  );

  const handleStartWayfinding = React.useCallback(() => {
    if (!selectedStart || !selectedDestination) {
      return;
    }

    router.push({
      pathname: "/navigation/navigation",
      params: {
        landmark_id: String(selectedDestination.landmark_id),
        name: selectedDestination.name,
        floor_number: String(selectedDestination.floor_number),
        start_node_id: selectedStart.nearest_node,
      },
    });
  }, [selectedDestination, selectedStart]);

  const showRecentSuggestions =
    pickerContext === "destination" && query.trim().length === 0 && recentDestinations.length > 0;
  const canStartWayfinding = Boolean(selectedStart && selectedDestination);

  return React.createElement(
    SafeAreaView,
    { style: styles.root, edges: ["top"] as const },
    React.createElement(
      ScrollView,
      { contentContainerStyle: styles.content, keyboardShouldPersistTaps: "handled" },
      React.createElement(Text, { style: styles.screenTitle }, "Where are you heading?"),
      React.createElement(
        View,
        { style: styles.card },
        React.createElement(Text, { style: styles.sectionLabel }, "Start location"),
        React.createElement(
          Pressable,
          {
            style: styles.selectorField,
            onPress: () => openPicker("start"),
            accessibilityRole: "button",
            accessibilityLabel: "Select start location",
          },
          React.createElement(Ionicons, {
            name: "navigate-circle-outline",
            size: 20,
            color: colors.textSecondary,
            style: styles.selectorIcon,
          }),
          React.createElement(
            Text,
            {
              style: [
                styles.selectorText,
                !selectedStart ? styles.selectorPlaceholder : null,
              ],
              numberOfLines: 1,
            },
            selectedStart ? selectedStart.name : "Choose your start location",
          ),
        ),
        React.createElement(Text, { style: styles.sectionLabel }, "Destination"),
        React.createElement(
          Pressable,
          {
            style: styles.selectorField,
            onPress: () => openPicker("destination"),
            accessibilityRole: "button",
            accessibilityLabel: "Select destination",
          },
          React.createElement(Ionicons, {
            name: "location-outline",
            size: 20,
            color: colors.textSecondary,
            style: styles.selectorIcon,
          }),
          React.createElement(
            Text,
            {
              style: [
                styles.selectorText,
                !selectedDestination ? styles.selectorPlaceholder : null,
              ],
              numberOfLines: 1,
            },
            selectedDestination ? selectedDestination.name : "Choose a destination",
          ),
        ),
        React.createElement(
          Pressable,
          {
            style: [
              styles.startButton,
              !canStartWayfinding ? styles.startButtonDisabled : null,
            ],
            disabled: !canStartWayfinding,
            onPress: handleStartWayfinding,
            accessibilityRole: "button",
            accessibilityLabel: "Start",
          },
          React.createElement(
            Text,
            {
              style: [
                styles.startButtonText,
                !canStartWayfinding ? styles.startButtonTextDisabled : null,
              ],
            },
            "Start",
          ),
        ),
      ),
      React.createElement(
        View,
        { style: styles.card },
        React.createElement(Text, { style: styles.sectionTitle }, "Quick actions"),
        React.createElement(
          View,
          { style: styles.quickActionRow },
          QUICK_ACTIONS.map((action) =>
            React.createElement(
              Pressable,
              {
                key: action.id,
                style: styles.quickActionButton,
                onPress: () => openPicker("destination", action.query),
                accessibilityRole: "button",
                accessibilityLabel: `Find ${action.label.toLowerCase()}`,
              },
              React.createElement(Ionicons, {
                // Ionicons type includes these names; explicit string keeps this file createElement-only.
                name: action.icon as "water-outline",
                size: 18,
                color: colors.primary,
              }),
              React.createElement(Text, { style: styles.quickActionLabel }, action.label),
            ),
          ),
        ),
      ),
      React.createElement(
        View,
        { style: styles.card },
        React.createElement(Text, { style: styles.sectionTitle }, "Recent destinations"),
        recentDestinations.length === 0
          ? React.createElement(
              Text,
              { style: styles.emptyRecentsText },
              "Your recent destination selections will appear here.",
            )
          : recentDestinations.slice(0, 5).map((landmark, index) =>
              React.createElement(
                View,
                { key: `recent-${landmark.landmark_id}` },
                React.createElement(SearchResultItem, {
                  landmark,
                  onPress: setSelectedDestination,
                }),
                index < Math.min(recentDestinations.length, 5) - 1 &&
                  React.createElement(View, { style: styles.separator }),
              ),
            ),
      ),
    ),
    pickerVisible &&
      React.createElement(
        KeyboardAvoidingView,
        {
          style: styles.modalOverlay,
          behavior: Platform.OS === "ios" ? "padding" : "height",
          keyboardVerticalOffset: 0,
        },
        React.createElement(
          View,
          { style: styles.modalCard },
          React.createElement(
            View,
            { style: styles.modalHeader },
            React.createElement(
              Text,
              { style: styles.modalTitle },
              pickerContext === "start" ? "Select start location" : "Select destination",
            ),
            React.createElement(
              Pressable,
              {
                onPress: closePicker,
                hitSlop: 8,
                accessibilityRole: "button",
                accessibilityLabel: "Close search",
              },
              React.createElement(Ionicons, {
                name: "close",
                size: 22,
                color: colors.textSecondary,
              }),
            ),
          ),
          React.createElement(SearchInput, {
            value: query,
            onChangeText: handleQueryChange,
          }),
          React.createElement(
            View,
            { style: styles.modalBody },
            loading &&
              React.createElement(
                View,
                { style: styles.centeredFeedback },
                React.createElement(ActivityIndicator, {
                  size: "large",
                  color: colors.primary,
                }),
              ),
            !loading &&
              error &&
              React.createElement(
                View,
                { style: styles.centeredFeedback },
                React.createElement(Text, { style: styles.errorText }, error),
                React.createElement(
                  Pressable,
                  {
                    onPress: () => void performSearch(query),
                    accessibilityRole: "button",
                    accessibilityLabel: "Retry search",
                  },
                  React.createElement(Text, { style: styles.retryText }, "Tap to retry"),
                ),
              ),
            !loading &&
              !error &&
              showRecentSuggestions &&
              React.createElement(
                ScrollView,
                {
                  style: styles.suggestionsContainer,
                  keyboardShouldPersistTaps: "handled",
                },
                React.createElement(
                  Text,
                  { style: styles.suggestionsHeader },
                  "Recent destinations",
                ),
                recentDestinations.slice(0, 5).map((landmark, index) =>
                  React.createElement(
                    View,
                    { key: `picker-recent-${landmark.landmark_id}` },
                    React.createElement(SearchResultItem, {
                      landmark,
                      onPress: handleSelectLandmark,
                    }),
                    index < Math.min(recentDestinations.length, 5) - 1 &&
                      React.createElement(View, { style: styles.separator }),
                  ),
                ),
              ),
            !loading &&
              !error &&
              !showRecentSuggestions &&
              results.length > 0 &&
              React.createElement(FlatList<LandmarkResult>, {
                data: results,
                keyExtractor: (item) => `result-${item.landmark_id}-${item.nearest_node}`,
                keyboardShouldPersistTaps: "handled",
                ItemSeparatorComponent: () => React.createElement(View, { style: styles.separator }),
                renderItem: ({ item }) =>
                  React.createElement(SearchResultItem, {
                    landmark: item,
                    onPress: handleSelectLandmark,
                  }),
              }),
            !loading &&
              !error &&
              query.trim().length > 0 &&
              searched &&
              results.length === 0 &&
              React.createElement(
                View,
                { style: styles.centeredFeedback },
                React.createElement(Text, { style: styles.emptyText }, "No results found."),
              ),
          ),
        ),
      ),
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.backgroundSecondary,
  },
  content: {
    padding: spacing.md,
    paddingBottom: spacing.xl,
  },
  screenTitle: {
    ...typography.h2,
    color: colors.text,
    marginBottom: spacing.md,
  },
  card: {
    backgroundColor: colors.background,
    borderRadius: radii.large,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  sectionTitle: {
    ...typography.h3,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  sectionLabel: {
    ...typography.label,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  selectorField: {
    minHeight: 48,
    borderRadius: radii.medium,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.secondary,
    backgroundColor: colors.backgroundSecondary,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.sm + 4,
    marginBottom: spacing.md,
  },
  selectorIcon: {
    marginRight: spacing.sm,
  },
  selectorText: {
    ...typography.body,
    color: colors.text,
    flexShrink: 1,
  },
  selectorPlaceholder: {
    color: colors.placeholder,
  },
  startButton: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
    backgroundColor: colors.primary,
    paddingVertical: spacing.sm + 2,
  },
  startButtonDisabled: {
    backgroundColor: colors.secondary,
    opacity: 0.6,
  },
  startButtonText: {
    ...typography.button,
    color: colors.buttonPrimaryText,
  },
  startButtonTextDisabled: {
    color: colors.buttonPrimaryTextDisabled,
  },
  quickActionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  quickActionButton: {
    flex: 1,
    minHeight: 72,
    borderRadius: radii.medium,
    backgroundColor: colors.backgroundSecondary,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.sm,
  },
  quickActionLabel: {
    ...typography.label,
    color: colors.text,
    marginTop: spacing.xs,
  },
  emptyRecentsText: {
    ...typography.body,
    color: colors.textSecondary,
  },
  separator: {
    marginHorizontal: spacing.md,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.secondary,
  },
  modalOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#00000055",
    justifyContent: "flex-end",
  },
  modalCard: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radii.large,
    borderTopRightRadius: radii.large,
    maxHeight: "78%",
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    minHeight: 320,
  },
  modalBody: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  modalTitle: {
    ...typography.h3,
    color: colors.text,
  },
  centeredFeedback: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xl,
  },
  emptyText: {
    ...typography.body,
    color: colors.textSecondary,
  },
  errorText: {
    ...typography.body,
    color: colors.danger,
    textAlign: "center",
    marginBottom: spacing.sm,
  },
  retryText: {
    ...typography.button,
    color: colors.primary,
  },
  suggestionsContainer: {
    marginHorizontal: spacing.md,
    backgroundColor: colors.backgroundSecondary,
    borderRadius: radii.medium,
    overflow: "hidden",
    marginBottom: spacing.md,
  },
  suggestionsHeader: {
    ...typography.label,
    color: colors.textSecondary,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
});
