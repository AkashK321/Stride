/** @type {import('jest').Config} */
module.exports = {
  // Use node environment for tests (react-native will be mocked)
  testEnvironment: "node",

  // Setup files (run before everything)
  setupFiles: ["./jest.setup-early.js"],
  // Setup files (run after test framework is installed)
  setupFilesAfterEnv: ["./jest.setup.js"],

  // Transform TypeScript and JavaScript files
  transform: {
    "^.+\\.(js|jsx|ts|tsx)$": "babel-jest",
  },

  // Module name mapper for assets and path aliases
  moduleNameMapper: {
    // Handle static assets (images, fonts, etc.)
    "\\.(jpg|jpeg|png|gif|eot|otf|webp|svg|ttf|woff|woff2|mp4|webm|wav|mp3|m4a|aac|oga)$":
      "jest-transform-stub",
    // Handle CSS modules (if used)
    "\\.(css|less|scss|sass)$": "identity-obj-proxy",
    // Path alias from tsconfig.json
    "^@/(.*)$": "<rootDir>/$1",
  },

  // Expo and RN packages ship untranspiled ES modules.
  // We must allow Jest's transformer to process them.
  // Note: react-native itself is excluded as it contains Flow syntax
  transformIgnorePatterns: [
    "node_modules/(?!" +
      "(@react-native(-community)?" +
      "|expo(nent)?" +
      "|expo-modules-core" +
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

  // File extensions to recognize
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json", "node"],

  // Collect coverage from source files, ignoring test files and config
  collectCoverageFrom: [
    "**/*.{ts,tsx}",
    "!**/*.test.{ts,tsx}",
    "!**/node_modules/**",
    "!jest.config.js",
    "!jest.setup.js",
    "!jest.setup-early.js",
    "!babel.config.js",
    "!eslint.config.js",
  ],
};
