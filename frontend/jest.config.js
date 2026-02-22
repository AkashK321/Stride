/** @type {import('jest').Config} */
module.exports = {
  preset: "jest-expo",

  setupFilesAfterEnv: ["./jest.setup.js"],

  // Expo and RN packages ship untranspiled ES modules.
  // We must allow Jest's transformer to process them.
  transformIgnorePatterns: [
    "node_modules/(?!" +
      "((jest-)?react-native" +
      "|@react-native(-community)?" +
      "|expo(nent)?" +
      "|@expo(nent)?/.*" +
      "|@expo-google-fonts/.*" +
      "|react-navigation" +
      "|@react-navigation/.*" +
      "|native-base" +
      "|react-native-svg" +
      "|react-native-reanimated" +
      "|react-native-gesture-handler" +
      "|react-native-screens" +
      "|react-native-safe-area-context" +
      "|react-native-worklets" +
      "|expo-router" +
      "|expo-secure-store" +
      "|expo-font" +
      "|expo-linking" +
      "|expo-constants" +
      "|expo-status-bar" +
      "|expo-splash-screen" +
      "|expo-image" +
      "|expo-haptics" +
      "|expo-web-browser" +
      "|expo-symbols" +
      "|expo-system-ui" +
      "|libphonenumber-js" +
      ")/)",
  ],

  // Collect coverage from source files, ignoring test files and config
  collectCoverageFrom: [
    "**/*.{ts,tsx}",
    "!**/*.test.{ts,tsx}",
    "!**/node_modules/**",
    "!jest.config.js",
    "!jest.setup.js",
    "!eslint.config.js",
  ],
};
