import * as React from "react";
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  FlatList,
} from "react-native";
import SearchResultItem from "./SearchResultItem";
import { resultsListStyles as styles } from "./styles";
import { colors } from "../../theme/colors";
import type { LandmarkResult } from "../../services/api";

export interface SearchResultsListProps {
  results: LandmarkResult[];
  loading: boolean;
  error: string | null;
  searched: boolean;
  onSelectResult: (landmark: LandmarkResult) => void;
  onRetry: () => void;
  recentResults?: LandmarkResult[];
  showRecents?: boolean;
}

export default function SearchResultsList({
  results,
  loading,
  error,
  searched,
  onSelectResult,
  onRetry,
  recentResults,
  showRecents,
}: SearchResultsListProps) {
  const renderItem = React.useCallback(
    ({ item }: { item: LandmarkResult }) =>
      React.createElement(SearchResultItem, {
        landmark: item,
        onPress: onSelectResult,
      }),
    [onSelectResult],
  );

  const keyExtractor = React.useCallback(
    (item: LandmarkResult, index: number) => `${item.nearest_node}-${index}`,
    [],
  );

  const renderEmpty = React.useCallback(() => {
    if (loading) {
      return React.createElement(
        View,
        { style: styles.centered },
        React.createElement(ActivityIndicator, {
          size: "large",
          color: colors.primary,
        }),
      );
    }

    if (error) {
      return React.createElement(
        View,
        { style: styles.centered },
        React.createElement(Text, { style: styles.errorText }, error),
        React.createElement(
          Pressable,
          {
            onPress: onRetry,
            accessibilityRole: "button" as const,
            accessibilityLabel: "Retry search",
          },
          React.createElement(Text, { style: styles.retryText }, "Tap to retry"),
        ),
      );
    }

    if (searched) {
      return React.createElement(
        View,
        { style: styles.centered },
        React.createElement(Text, { style: styles.emptyText }, "No results found"),
      );
    }

    return null;
  }, [loading, error, searched, onRetry]);

  return React.createElement(
    React.Fragment,
    null,
    showRecents &&
      recentResults &&
      recentResults.length > 0 &&
      React.createElement(
        View,
        { style: styles.recentsContainer },
        React.createElement(
          View,
          { style: styles.recentsSection },
          React.createElement(
            Text,
            { style: styles.recentsHeader },
            "Recents",
          ),
          recentResults.map((item, index) =>
            React.createElement(
              View,
              { key: `${item.nearest_node}-recent-${index}` },
              React.createElement(SearchResultItem, {
                landmark: item,
                onPress: onSelectResult,
              }),
              index < recentResults.length - 1 &&
                React.createElement(View, { style: styles.separator }),
            ),
          ),
        ),
      ),
    results.length > 0 &&
      React.createElement(
        View,
        { style: styles.resultsContainer },
      React.createElement(FlatList<LandmarkResult>, {
          data: results,
          keyExtractor,
          renderItem,
          ListEmptyComponent: renderEmpty,
          contentContainerStyle: styles.listContent,
          keyboardShouldPersistTaps: "handled",
          ItemSeparatorComponent: () =>
            React.createElement(View, { style: styles.separator }),
        }),
      ),
  );
}
