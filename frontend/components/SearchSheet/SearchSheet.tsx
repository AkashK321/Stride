import * as React from "react";
import {
  Animated,
  Dimensions,
  Keyboard,
  PanResponder,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import SearchInput from "./SearchInput";
import SearchResultsList from "./SearchResultsList";
import { sheetStyles as styles } from "./styles";
import { searchLandmarks, LandmarkResult } from "../../services/api";

const DEBOUNCE_MS = 300;

const REST_HEIGHT = 80;
const MID_HEIGHT_FRACTION = 0.5;
const FULL_HEIGHT_FRACTION = 0.8;

export interface SearchSheetProps {
  onSelectDestination: (landmark: LandmarkResult) => void;
}

export interface SearchSheetRef {
  collapse: () => void;
}

const SearchSheet = React.forwardRef<SearchSheetRef, SearchSheetProps>(
  ({ onSelectDestination }, ref) => {
    const insets = useSafeAreaInsets();
    const screenHeight = Dimensions.get("window").height;
    const snapHeights = React.useMemo(() => {
      const mid = Math.round(screenHeight * MID_HEIGHT_FRACTION);
      const full = Math.round(screenHeight * FULL_HEIGHT_FRACTION);
      return {
        rest: REST_HEIGHT,
        mid,
        full,
      };
    }, [screenHeight]);

    const sheetHeight = React.useRef(new Animated.Value(snapHeights.rest)).current;
    const dragStartHeightRef = React.useRef(snapHeights.rest);

    const [query, setQuery] = React.useState("");
    const [results, setResults] = React.useState<LandmarkResult[]>([]);
    const [recentResults, setRecentResults] = React.useState<LandmarkResult[]>(
      [],
    );
    const [loading, setLoading] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [searched, setSearched] = React.useState(false);
    const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(
      null,
    );

    // Expose collapse method
    React.useImperativeHandle(ref, () => ({
      collapse: () => {
        Animated.spring(sheetHeight, {
          toValue: snapHeights.rest,
          useNativeDriver: false,
        }).start();
      },
    }));

    // ------------------------
    // SEARCH
    // ------------------------

    const performSearch = React.useCallback(async (text: string) => {
      if (text.trim().length === 0) {
        setResults([]);
        setSearched(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const response = await searchLandmarks(text.trim());
        setResults(response.results);
        setRecentResults((prev) => {
          if (!response.results || response.results.length === 0) {
            return prev;
          }
          const seen = new Set<number>();
          const merged: LandmarkResult[] = [];

          // New results first
          for (const item of response.results) {
            if (!seen.has(item.landmark_id)) {
              seen.add(item.landmark_id);
              merged.push(item);
            }
          }

          // Then existing recents that weren't in this batch
          for (const item of prev) {
            if (!seen.has(item.landmark_id)) {
              seen.add(item.landmark_id);
              merged.push(item);
            }
          }

          // Keep only a reasonable number of recents
          return merged.slice(0, 10);
        });
        setSearched(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Search failed");
        setResults([]);
        setSearched(true);
      } finally {
        setLoading(false);
      }
    }, []);

    const handleChangeText = React.useCallback(
      (text: string) => {
        setQuery(text);

        if (debounceRef.current) clearTimeout(debounceRef.current);

        if (text.trim().length === 0) {
          setResults([]);
          setSearched(false);
          setError(null);
          return;
        }

        debounceRef.current = setTimeout(() => {
          performSearch(text);
        }, DEBOUNCE_MS);
      },
      [performSearch],
    );

    React.useEffect(() => {
      return () => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
      };
    }, []);

    // ------------------------
    // KEYBOARD-SAFE SNAP LOGIC
    // ------------------------

    const snapTo = React.useCallback(
      (target: number) => {
        Animated.spring(sheetHeight, {
          toValue: target,
          useNativeDriver: false,
        }).start();
      },
      [sheetHeight],
    );

    const expandToFull = React.useCallback(() => {
      snapTo(snapHeights.full);
    }, [snapHeights.full, snapTo]);

    const handleFocus = React.useCallback(() => {
      expandToFull();
    }, [expandToFull]);

    const handleSelectResult = React.useCallback(
      (landmark: LandmarkResult) => {
        Keyboard.dismiss();

        onSelectDestination(landmark);

         // Move selected destination to the front of recent results
        setRecentResults((prev) => {
          const filtered = prev.filter(
            (item) => item.landmark_id !== landmark.landmark_id,
          );
          return [landmark, ...filtered].slice(0, 10);
        });

        setQuery("");
        setResults([]);
        setSearched(false);
        setError(null);
        snapTo(snapHeights.rest);
      },
      [onSelectDestination, snapHeights.rest, snapTo],
    );

    const handleRetry = React.useCallback(() => {
      performSearch(query);
    }, [performSearch, query]);

    const clampHeight = React.useCallback(
      (height: number) =>
        Math.max(snapHeights.rest, Math.min(snapHeights.full, height)),
      [snapHeights.full, snapHeights.rest],
    );

    const panResponder = React.useMemo(
      () =>
        PanResponder.create({
          onMoveShouldSetPanResponder: (_, gesture) =>
            Math.abs(gesture.dy) > 4,
          onPanResponderGrant: () => {
            sheetHeight.stopAnimation((value: number) => {
              dragStartHeightRef.current = value;
            });
          },
          onPanResponderMove: (_, gesture) => {
            const next = clampHeight(dragStartHeightRef.current - gesture.dy);
            sheetHeight.setValue(next);
          },
          onPanResponderRelease: () => {
            sheetHeight.stopAnimation((value: number) => {
              const distances = [
                { target: snapHeights.rest, d: Math.abs(value - snapHeights.rest) },
                { target: snapHeights.mid, d: Math.abs(value - snapHeights.mid) },
                { target: snapHeights.full, d: Math.abs(value - snapHeights.full) },
              ];
              distances.sort((a, b) => a.d - b.d);
              snapTo(distances[0].target);
            });
          },
        }),
      [clampHeight, sheetHeight, snapHeights.full, snapHeights.mid, snapHeights.rest, snapTo],
    );

    // ------------------------
    // RENDER
    // ------------------------

    return React.createElement(
      Animated.View,
      {
        style: [
          sheetLocalStyles.sheet,
          styles.background,
          { height: sheetHeight, paddingBottom: insets.bottom },
        ],
      },
      React.createElement(
        View,
        { style: sheetLocalStyles.handleArea, ...panResponder.panHandlers },
        React.createElement(View, { style: styles.handleIndicator }),
      ),
      React.createElement(SearchInput, {
        value: query,
        onChangeText: handleChangeText,
        onFocus: handleFocus,
      }),
      React.createElement(SearchResultsList, {
        results: query.trim().length === 0 ? [] : results,
        recentResults: query.trim().length === 0 ? recentResults.slice(0, 3) : [],
        showRecents: query.trim().length === 0 && recentResults.length > 0,
        loading,
        error,
        searched,
        onSelectResult: handleSelectResult,
        onRetry: handleRetry,
      }),
    );
  },
);

SearchSheet.displayName = "SearchSheet";
export default SearchSheet;

const sheetLocalStyles = StyleSheet.create({
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
  },
  handleArea: {
    alignItems: "center",
    paddingTop: 10,
    paddingBottom: 8,
  },
});