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

// expo-av: mock audio playback for orientation feedback
jest.mock("expo-av", () => ({
  Audio: {
    setAudioModeAsync: jest.fn(() => Promise.resolve()),
    Sound: {
      createAsync: jest.fn(() =>
        Promise.resolve({
          sound: {
            replayAsync: jest.fn(() => Promise.resolve()),
            stopAsync: jest.fn(() => Promise.resolve()),
            unloadAsync: jest.fn(() => Promise.resolve()),
          },
        })
      ),
    },
  },
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

// expo-local-authentication: mock biometric APIs
jest.mock("expo-local-authentication", () => ({
  hasHardwareAsync: jest.fn(() => Promise.resolve(true)),
  isEnrolledAsync: jest.fn(() => Promise.resolve(true)),
  supportedAuthenticationTypesAsync: jest.fn(() => Promise.resolve([1])),
  authenticateAsync: jest.fn(() =>
    Promise.resolve({
      success: true,
      error: undefined,
      warning: undefined,
    })
  ),
}));

// react-native-safe-area-context: mock SafeAreaView
jest.mock("react-native-safe-area-context", () => {
  const React = require("react");
  const { View } = require("react-native");
  return {
    SafeAreaView: (props: any) => React.createElement(View, props, props.children),
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

// @expo/vector-icons: mock Ionicons
jest.mock("@expo/vector-icons", () => ({
  Ionicons: (props: any) => {
    const React = require("react");
    const { Text } = require("react-native");
    return React.createElement(Text, { testID: `icon-${props.name}` }, props.name);
  },
}));

// Alert.alert is already mocked in jest.setup-early.js

// Silence noisy RN warnings in test output (optional)
const originalWarn = console.warn;
console.warn = (...args) => {
  if (typeof args[0] === "string" && args[0].includes("Animated:")) return;
  originalWarn(...args);
};

// --- Sensor and file system mocks (added for SensorService) ---

// expo-sharing: mock file sharing
jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(() => Promise.resolve(true)),
  shareAsync: jest.fn(() => Promise.resolve()),
}));

// expo-sensors: mock IMU sensors
jest.mock('expo-sensors', () => ({
  Accelerometer: {
    addListener: jest.fn(() => ({ remove: jest.fn() })),
    setUpdateInterval: jest.fn(),
  },
  Gyroscope: {
    addListener: jest.fn(() => ({ remove: jest.fn() })),
    setUpdateInterval: jest.fn(),
  },
  Magnetometer: {
    addListener: jest.fn(() => ({ remove: jest.fn() })),
    setUpdateInterval: jest.fn(),
  },
}));

// expo-file-system/legacy: mock file operations
jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///mock/documents/',
  getInfoAsync: jest.fn(() => Promise.resolve({ exists: false })),
  makeDirectoryAsync: jest.fn(() => Promise.resolve()),
  writeAsStringAsync: jest.fn(() => Promise.resolve()),
  readAsStringAsync: jest.fn(() => Promise.resolve('{}')),
  readDirectoryAsync: jest.fn(() => Promise.resolve([])),
  deleteAsync: jest.fn(() => Promise.resolve()),
}));