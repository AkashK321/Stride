// Mock react-native early to prevent Flow syntax parsing issues
// This runs before any other setup files
jest.mock("react-native", () => {
  // Return a minimal mock that satisfies the basic requirements
  return {
    Platform: {
      OS: "ios",
      select: jest.fn((obj) => obj.ios || obj.default),
    },
    StyleSheet: {
      create: jest.fn((styles) => styles),
    },
    View: "View",
    Text: "Text",
    ScrollView: "ScrollView",
    TouchableOpacity: "TouchableOpacity",
    TouchableHighlight: "TouchableHighlight",
    TouchableWithoutFeedback: "TouchableWithoutFeedback",
    Image: "Image",
    TextInput: "TextInput",
    ActivityIndicator: "ActivityIndicator",
    FlatList: "FlatList",
    SectionList: "SectionList",
    Animated: {
      View: "Animated.View",
      Text: "Animated.Text",
      Value: jest.fn(),
      timing: jest.fn(),
      spring: jest.fn(),
    },
  };
});
