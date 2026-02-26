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
          results={results}
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