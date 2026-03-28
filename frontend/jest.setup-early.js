// Define globals that Expo expects
global.__DEV__ = true;
// Mock react-native early to prevent Flow syntax parsing issues
// This runs before any other setup files
// @testing-library/react-native will provide proper component implementations
const React = require("react");

// Create proper React component mocks (not just strings)
const createMockComponent = (name) => {
  const Component = (props) => {
    // Store props on the element so testing library can query them
    const element = React.createElement(name, {
      ...props,
      // Make accessibility props available for querying
      testID: props.testID || props.accessibilityLabel || props.accessibilityRole,
    }, props.children);
    return element;
  };
  Component.displayName = name;
  return Component;
};

// Pressable needs special handling for onPress events
const createMockPressable = () => {
  const Pressable = (props) => {
    const handlePress = (e) => {
      if (props.onPress && !props.disabled) {
        props.onPress(e);
      }
    };
    return React.createElement("Pressable", {
      ...props,
      onPress: handlePress,
      testID: props.testID || props.accessibilityLabel || props.accessibilityRole,
    }, props.children);
  };
  Pressable.displayName = "Pressable";
  return Pressable;
};

jest.mock("react-native", () => {
  return {
    Platform: {
      OS: "ios",
      select: jest.fn((obj) => obj.ios || obj.default),
    },
    StyleSheet: {
      create: jest.fn((styles) => styles),
      flatten: jest.fn((style) => {
        // Simple flatten implementation for testing
        if (!style) return {};
        if (Array.isArray(style)) {
          return Object.assign({}, ...style.filter(Boolean));
        }
        return style;
      }),
    },
    View: createMockComponent("View"),
    Text: createMockComponent("Text"),
    ScrollView: createMockComponent("ScrollView"),
    TouchableOpacity: createMockComponent("TouchableOpacity"),
    TouchableHighlight: createMockComponent("TouchableHighlight"),
    TouchableWithoutFeedback: createMockComponent("TouchableWithoutFeedback"),
    Pressable: createMockPressable(),
    Image: createMockComponent("Image"),
    TextInput: createMockComponent("TextInput"),
    ActivityIndicator: createMockComponent("ActivityIndicator"),
    FlatList: createMockComponent("FlatList"),
    SectionList: createMockComponent("SectionList"),
    Animated: {
      View: createMockComponent("Animated.View"),
      Text: createMockComponent("Animated.Text"),
      Value: jest.fn(),
      timing: jest.fn(),
      spring: jest.fn(),
    },
    Alert: {
      alert: jest.fn(),
    },
    Keyboard: {
      dismiss: jest.fn(),
      addListener: jest.fn(() => ({ remove: jest.fn() })),
    },
    KeyboardAvoidingView: createMockComponent("KeyboardAvoidingView"),
    Platform: {
      OS: "ios",
      select: jest.fn((obj) => obj.ios || obj.default),
    },
    Dimensions: {
      get: jest.fn(() => ({ width: 375, height: 812 })),
    },
  };
});
