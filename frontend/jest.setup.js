// Note: @testing-library/jest-native is deprecated.
// Matchers are built into @testing-library/react-native v12.4+
// No need to extend expect - matchers are available automatically

// --- Native module mocks ---

// expo-secure-store: in-memory mock used by tokenStorage.ts
jest.mock("expo-secure-store", () => {
  let store = {};
  return {
    setItemAsync: jest.fn((key, value) => {
      store[key] = value;
      return Promise.resolve();
    }),
    getItemAsync: jest.fn((key) => Promise.resolve(store[key] ?? null)),
    deleteItemAsync: jest.fn((key) => {
      delete store[key];
      return Promise.resolve();
    }),
    // Helper to reset between tests (non-standard, test-only)
    __resetStore: () => { store = {}; },
  };
});

// expo-router: stub navigation hooks
jest.mock("expo-router", () => ({
  useRouter: () => ({
    replace: jest.fn(),
    push: jest.fn(),
    back: jest.fn(),
  }),
  useSegments: () => [],
  useLocalSearchParams: () => ({}),
}));

// react-native-reanimated: official mock
jest.mock("react-native-reanimated", () =>
  require("react-native-reanimated/mock")
);

// expo-haptics: mock haptic feedback
jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  selectionAsync: jest.fn(),
}));

// expo-font: mock font loading
jest.mock("expo-font", () => ({
  loadAsync: jest.fn(() => Promise.resolve()),
  isLoaded: jest.fn(() => true),
}));

// @expo-google-fonts/roboto: mock font loading
jest.mock("@expo-google-fonts/roboto", () => ({
  useFonts: jest.fn(() => [true, null]),
}));

// Silence noisy RN warnings in test output (optional)
const originalWarn = console.warn;
console.warn = (...args) => {
  if (typeof args[0] === "string" && args[0].includes("Animated:")) return;
  originalWarn(...args);
};
