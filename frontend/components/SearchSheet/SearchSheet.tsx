import * as React from "react";
import { Keyboard } from "react-native";
import BottomSheet from "@gorhom/bottom-sheet";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import SearchInput from "./SearchInput";
import SearchResultsList from "./SearchResultsList";
import { sheetStyles as styles } from "./styles";
import { searchLandmarks, LandmarkResult } from "../../services/api";

const DEBOUNCE_MS = 300;
const SNAP_REST = 1;
const SNAP_FULL = 3;

export interface SearchSheetProps {
  onSelectDestination: (landmark: LandmarkResult) => void;
}

export interface SearchSheetRef {
  collapse: () => void;
}

const SearchSheet = React.forwardRef<SearchSheetRef, SearchSheetProps>(
  ({ onSelectDestination }, ref) => {
    const bottomSheetRef = React.useRef<BottomSheet>(null);
    const currentIndexRef = React.useRef<number>(SNAP_REST);

    const insets = useSafeAreaInsets();
    const snapPoints = React.useMemo(
      () => [90, "50%", "95%"],
      [],
    );

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
        bottomSheetRef.current?.snapToIndex(SNAP_REST);
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

    const expandToFull = React.useCallback(() => {
      if (currentIndexRef.current !== SNAP_FULL) {
        bottomSheetRef.current?.snapToIndex(SNAP_FULL);
      }
    }, []);

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

        bottomSheetRef.current?.snapToIndex(SNAP_REST);
      },
      [onSelectDestination],
    );

    const handleRetry = React.useCallback(() => {
      performSearch(query);
    }, [performSearch, query]);

    const handleSheetChange = React.useCallback((index: number) => {
      currentIndexRef.current = index;
    }, []);

    // ------------------------
    // RENDER
    // ------------------------

    return (
      <BottomSheet
        ref={bottomSheetRef}
        index={SNAP_REST}
        snapPoints={snapPoints}
        onChange={handleSheetChange}
        topInset={insets.top}
        backgroundStyle={styles.background}
        handleIndicatorStyle={styles.handleIndicator}
        enablePanDownToClose={false}
        enableOverDrag={false}
        keyboardBehavior="extend"        // CRITICAL
        keyboardBlurBehavior="none"      // CRITICAL
        android_keyboardInputMode="adjustResize"
      >
        <SearchInput
          value={query}
          onChangeText={handleChangeText}
          onFocus={handleFocus}
        />

        <SearchResultsList
          results={query.trim().length === 0 ? [] : results}
          recentResults={
            query.trim().length === 0 ? recentResults.slice(0, 3) : []
          }
          showRecents={query.trim().length === 0 && recentResults.length > 0}
          loading={loading}
          error={error}
          searched={searched}
          onSelectResult={handleSelectResult}
          onRetry={handleRetry}
        />
      </BottomSheet>
    );
  },
);

SearchSheet.displayName = "SearchSheet";
export default SearchSheet;