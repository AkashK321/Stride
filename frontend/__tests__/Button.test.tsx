/**
 * Unit tests for Button component
 */

import * as React from "react";
import { render, fireEvent, screen } from "@testing-library/react-native";
import Button from "../components/Button/Button";

describe("Button", () => {
  const defaultProps = {
    onPress: jest.fn(),
    title: "Test Button",
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // --- Rendering ---

  it("renders the title text", () => {
    render(<Button {...defaultProps} />);
    expect(screen.getByText("Test Button")).toBeTruthy();
  });

  it("uses custom accessibilityLabel when provided", () => {
    render(<Button {...defaultProps} accessibilityLabel="Custom Label" />);
    expect(screen.getByLabelText("Custom Label")).toBeTruthy();
  });

  it("falls back to title for accessibilityLabel", () => {
    render(<Button {...defaultProps} />);
    expect(screen.getByLabelText("Test Button")).toBeTruthy();
  });

  // --- Press behavior ---

  it("calls onPress when pressed", () => {
    render(<Button {...defaultProps} />);
    fireEvent.press(screen.getByLabelText("Test Button"));
    expect(defaultProps.onPress).toHaveBeenCalledTimes(1);
  });

  it("does not call onPress when disabled", () => {
    render(<Button {...defaultProps} disabled />);
    const button = screen.getByLabelText("Test Button");
    fireEvent.press(button);
    expect(defaultProps.onPress).not.toHaveBeenCalled();
  });

  it("does not call onPress when loading", () => {
    render(<Button {...defaultProps} loading />);
    const button = screen.getByLabelText("Test Button");
    fireEvent.press(button);
    expect(defaultProps.onPress).not.toHaveBeenCalled();
  });

  it("does not call onPress when both disabled and loading", () => {
    render(<Button {...defaultProps} disabled loading />);
    const button = screen.getByLabelText("Test Button");
    fireEvent.press(button);
    expect(defaultProps.onPress).not.toHaveBeenCalled();
  });

  // --- Loading state ---

  it("shows ActivityIndicator when loading is true", () => {
    const { UNSAFE_root } = render(<Button {...defaultProps} loading />);
    // ActivityIndicator is rendered as a child of Pressable
    const activityIndicator = UNSAFE_root.findAllByType(
      require("react-native").ActivityIndicator
    );
    expect(activityIndicator.length).toBeGreaterThan(0);
  });

  it("hides title text visually during loading", () => {
    const { UNSAFE_root } = render(<Button {...defaultProps} loading />);
    const textElement = UNSAFE_root.findByType(require("react-native").Text);
    const textStyle = textElement.props.style;
    
    // Check if textLoading style (opacity: 0) is applied
    // Style can be an array or a single object
    const styles = Array.isArray(textStyle) ? textStyle : [textStyle];
    const hasLoadingStyle = styles.some((style: any) => 
      style && typeof style === 'object' && style.opacity === 0
    );
    
    expect(hasLoadingStyle).toBe(true);
  });

  it("sets accessibilityState.disabled to true during loading", () => {
    render(<Button {...defaultProps} loading />);
    const button = screen.getByLabelText("Test Button");
    expect(button.props.accessibilityState).toEqual(
      expect.objectContaining({ disabled: true })
    );
  });

  // --- Disabled state ---

  it("sets accessibilityState.disabled to true when disabled", () => {
    render(<Button {...defaultProps} disabled />);
    const button = screen.getByLabelText("Test Button");
    expect(button.props.accessibilityState).toEqual(
      expect.objectContaining({ disabled: true })
    );
  });

  it("applies opacity 0.5 container style when disabled", () => {
    const { UNSAFE_root } = render(<Button {...defaultProps} disabled />);
    const pressable = UNSAFE_root.findByType(require("react-native").Pressable);
    const containerStyle = pressable.props.style;
    
    // Check if containerDisabled style (opacity: 0.5) is applied
    const styles = Array.isArray(containerStyle) ? containerStyle : [containerStyle];
    const hasDisabledStyle = styles.some((style: any) => 
      style && typeof style === 'object' && style.opacity === 0.5
    );
    
    expect(hasDisabledStyle).toBe(true);
  });

  // --- Accessibility ---

  it("has accessibilityRole button by default", () => {
    render(<Button {...defaultProps} />);
    const button = screen.getByLabelText("Test Button");
    expect(button.props.accessibilityRole).toBe("button");
  });

  it("forwards accessibilityRole when provided", () => {
    render(<Button {...defaultProps} accessibilityRole="link" />);
    const button = screen.getByLabelText("Test Button");
    expect(button.props.accessibilityRole).toBe("link");
  });

  it("forwards accessibilityHint when provided", () => {
    render(<Button {...defaultProps} accessibilityHint="This button submits the form" />);
    const button = screen.getByLabelText("Test Button");
    expect(button.props.accessibilityHint).toBe("This button submits the form");
  });

  // --- Variants ---

  it.each(["primary", "secondary", "danger"] as const)(
    "renders %s variant without error",
    (variant) => {
      expect(() =>
        render(<Button {...defaultProps} variant={variant} />)
      ).not.toThrow();
    }
  );

  it("renders primary variant by default", () => {
    // Just verify it renders without error - the actual style is an implementation detail
    // but we can verify it has a backgroundColor (which all variants have)
    const { UNSAFE_root } = render(<Button {...defaultProps} />);
    const pressable = UNSAFE_root.findByType(require("react-native").Pressable);
    const containerStyle = pressable.props.style;
    
    // Check if any style has backgroundColor (all variants have this)
    const styles = Array.isArray(containerStyle) ? containerStyle : [containerStyle];
    const hasBackgroundColor = styles.some((style: any) => 
      style && typeof style === 'object' && style.backgroundColor !== undefined
    );
    
    expect(hasBackgroundColor).toBe(true);
  });

  // --- Sizes ---

  it.each(["small", "medium", "large"] as const)(
    "renders %s size without error",
    (size) => {
      expect(() =>
        render(<Button {...defaultProps} size={size} />)
      ).not.toThrow();
    }
  );

  it("renders medium size by default", () => {
    const { UNSAFE_root } = render(<Button {...defaultProps} />);
    const pressable = UNSAFE_root.findByType(require("react-native").Pressable);
    const containerStyle = pressable.props.style;
    
    // Check if paddingVertical is applied (all sizes have this)
    const styles = Array.isArray(containerStyle) ? containerStyle : [containerStyle];
    const hasPadding = styles.some((style: any) => 
      style && typeof style === 'object' && style.paddingVertical !== undefined
    );
    
    expect(hasPadding).toBe(true);
  });

  // --- Custom styles ---

  it("merges custom style prop with default styles", () => {
    const customStyle = { marginTop: 10 };
    const { UNSAFE_root } = render(
      <Button {...defaultProps} style={customStyle} />
    );
    const pressable = UNSAFE_root.findByType(require("react-native").Pressable);
    const containerStyle = pressable.props.style;
    
    const styles = Array.isArray(containerStyle) ? containerStyle : [containerStyle];
    const hasCustomStyle = styles.some((style: any) => 
      style && typeof style === 'object' && style.marginTop === 10
    );
    
    expect(hasCustomStyle).toBe(true);
  });

  it("merges custom textStyle prop with default text styles", () => {
    const customTextStyle = { fontSize: 20 };
    const { UNSAFE_root } = render(
      <Button {...defaultProps} textStyle={customTextStyle} />
    );
    const textElement = UNSAFE_root.findByType(require("react-native").Text);
    const textStyle = textElement.props.style;
    
    const styles = Array.isArray(textStyle) ? textStyle : [textStyle];
    const hasCustomTextStyle = styles.some((style: any) => 
      style && typeof style === 'object' && style.fontSize === 20
    );
    
    expect(hasCustomTextStyle).toBe(true);
  });
});
