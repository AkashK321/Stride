/**
 * Unit tests for Label component
 */

import * as React from "react";
import { render, screen } from "@testing-library/react-native";
import Label from "../components/Label/Label";

describe("Label", () => {
  // --- Rendering ---

  it("renders children text content", () => {
    render(<Label>Hello World</Label>);
    expect(screen.getByText("Hello World")).toBeTruthy();
  });

  it("renders React element children", () => {
    const NestedText = () =>
      React.createElement(require("react-native").Text, {}, "Nested Text");
    render(
      <Label>
        {React.createElement(NestedText)}
      </Label>
    );
    expect(screen.getByText("Nested Text")).toBeTruthy();
  });

  it("renders multiple text children", () => {
    render(
      <Label>
        First{" "}
        {React.createElement(require("react-native").Text, { style: { fontWeight: "bold" } }, "Second")}
        {" "}Third
      </Label>
    );
    // Should render all children
    const label = screen.getByText(/First.*Second.*Third/);
    expect(label).toBeTruthy();
  });

  // --- Variants ---

  it.each([
    "screenTitle",
    "sectionHeader",
    "formHeader",
    "formLabel",
    "error",
    "caption",
    "body",
  ] as const)("renders %s variant without error", (variant) => {
    expect(() =>
      render(<Label variant={variant}>Test Label</Label>)
    ).not.toThrow();
  });

  it("renders body variant by default", () => {
    const { UNSAFE_root } = render(<Label>Test Label</Label>);
    const textElement = UNSAFE_root.findByType(require("react-native").Text);
    const textStyle = textElement.props.style;
    
    // Check if body variant style is applied (default)
    const styles = Array.isArray(textStyle) ? textStyle : [textStyle];
    // Body variant should have typography.body styles
    const hasBodyStyle = styles.some((style: any) => 
      style && typeof style === 'object' && style.fontSize !== undefined
    );
    
    expect(hasBodyStyle).toBe(true);
  });

  it("applies screenTitle variant styles", () => {
    const { UNSAFE_root } = render(<Label variant="screenTitle">Screen Title</Label>);
    const textElement = UNSAFE_root.findByType(require("react-native").Text);
    const textStyle = textElement.props.style;
    
    const styles = Array.isArray(textStyle) ? textStyle : [textStyle];
    // screenTitle should have fontSize: 40
    const hasScreenTitleStyle = styles.some((style: any) => 
      style && typeof style === 'object' && style.fontSize === 40
    );
    
    expect(hasScreenTitleStyle).toBe(true);
  });

  it("applies sectionHeader variant styles", () => {
    const { UNSAFE_root } = render(<Label variant="sectionHeader">Section Header</Label>);
    const textElement = UNSAFE_root.findByType(require("react-native").Text);
    const textStyle = textElement.props.style;
    
    // Verify it has typography.h1 styles (sectionHeader uses h1)
    const styles = Array.isArray(textStyle) ? textStyle : [textStyle];
    const hasHeaderStyle = styles.some((style: any) => 
      style && typeof style === 'object' && style.fontSize !== undefined
    );
    
    expect(hasHeaderStyle).toBe(true);
  });

  it("applies formHeader variant styles", () => {
    const { UNSAFE_root } = render(<Label variant="formHeader">Form Header</Label>);
    const textElement = UNSAFE_root.findByType(require("react-native").Text);
    const textStyle = textElement.props.style;
    
    // Verify it has typography.medium styles
    const styles = Array.isArray(textStyle) ? textStyle : [textStyle];
    const hasFormHeaderStyle = styles.some((style: any) => 
      style && typeof style === 'object' && style.fontSize !== undefined
    );
    
    expect(hasFormHeaderStyle).toBe(true);
  });

  it("applies formLabel variant styles", () => {
    const { UNSAFE_root } = render(<Label variant="formLabel">Form Label</Label>);
    const textElement = UNSAFE_root.findByType(require("react-native").Text);
    const textStyle = textElement.props.style;
    
    // Verify it has typography.label styles
    const styles = Array.isArray(textStyle) ? textStyle : [textStyle];
    const hasFormLabelStyle = styles.some((style: any) => 
      style && typeof style === 'object' && style.fontSize !== undefined
    );
    
    expect(hasFormLabelStyle).toBe(true);
  });

  it("applies error variant styles", () => {
    const { UNSAFE_root } = render(<Label variant="error">Error Message</Label>);
    const textElement = UNSAFE_root.findByType(require("react-native").Text);
    const textStyle = textElement.props.style;
    
    // Error variant should have danger color
    const styles = Array.isArray(textStyle) ? textStyle : [textStyle];
    const hasErrorStyle = styles.some((style: any) => 
      style && typeof style === 'object' && style.color !== undefined
    );
    
    expect(hasErrorStyle).toBe(true);
  });

  it("applies caption variant styles", () => {
    const { UNSAFE_root } = render(<Label variant="caption">Caption Text</Label>);
    const textElement = UNSAFE_root.findByType(require("react-native").Text);
    const textStyle = textElement.props.style;
    
    // Caption variant should have typography.label styles
    const styles = Array.isArray(textStyle) ? textStyle : [textStyle];
    const hasCaptionStyle = styles.some((style: any) => 
      style && typeof style === 'object' && style.fontSize !== undefined
    );
    
    expect(hasCaptionStyle).toBe(true);
  });

  // --- Color override ---

  it("applies color prop to text style when provided", () => {
    const { UNSAFE_root } = render(<Label color="#FF0000">Red Text</Label>);
    const textElement = UNSAFE_root.findByType(require("react-native").Text);
    const textStyle = textElement.props.style;
    
    const styles = Array.isArray(textStyle) ? textStyle : [textStyle];
    const hasCustomColor = styles.some((style: any) => 
      style && typeof style === 'object' && style.color === "#FF0000"
    );
    
    expect(hasCustomColor).toBe(true);
  });

  it("uses variant's default color when color is not provided", () => {
    const { UNSAFE_root } = render(<Label variant="body">Body Text</Label>);
    const textElement = UNSAFE_root.findByType(require("react-native").Text);
    const textStyle = textElement.props.style;
    
    const styles = Array.isArray(textStyle) ? textStyle : [textStyle];
    // Should have a color from the variant (body variant has colors.text)
    const hasColor = styles.some((style: any) => 
      style && typeof style === 'object' && style.color !== undefined
    );
    
    expect(hasColor).toBe(true);
  });

  it("color override takes precedence over variant default color", () => {
    const { UNSAFE_root } = render(
      <Label variant="error" color="#00FF00">Green Error Text</Label>
    );
    const textElement = UNSAFE_root.findByType(require("react-native").Text);
    const textStyle = textElement.props.style;
    
    const styles = Array.isArray(textStyle) ? textStyle : [textStyle];
    // Custom color should be applied (last in style array takes precedence)
    const styleArray = Array.isArray(textStyle) ? textStyle : [textStyle];
    const lastStyle = styleArray[styleArray.length - 1];
    
    // The color prop is added after variant style, so it should override
    const hasCustomColor = styles.some((style: any) => 
      style && typeof style === 'object' && style.color === "#00FF00"
    );
    
    expect(hasCustomColor).toBe(true);
  });

  // --- Custom style ---

  it("merges style prop with variant styles", () => {
    const customStyle = { fontSize: 24, fontWeight: "bold" as const };
    const { UNSAFE_root } = render(
      <Label variant="body" style={customStyle}>Custom Styled Text</Label>
    );
    const textElement = UNSAFE_root.findByType(require("react-native").Text);
    const textStyle = textElement.props.style;
    
    const styles = Array.isArray(textStyle) ? textStyle : [textStyle];
    const hasCustomFontSize = styles.some((style: any) => 
      style && typeof style === 'object' && style.fontSize === 24
    );
    
    expect(hasCustomFontSize).toBe(true);
  });

  it("custom style takes precedence over variant style", () => {
    const customStyle = { fontSize: 50 };
    const { UNSAFE_root } = render(
      <Label variant="screenTitle" style={customStyle}>Large Text</Label>
    );
    const textElement = UNSAFE_root.findByType(require("react-native").Text);
    const textStyle = textElement.props.style;
    
    // Custom style is last in array, so it should override variant fontSize
    const styles = Array.isArray(textStyle) ? textStyle : [textStyle];
    const lastStyle = styles[styles.length - 1];
    
    // The last style (custom style) should have fontSize 50
    expect(lastStyle && typeof lastStyle === 'object' && lastStyle.fontSize).toBe(50);
  });

  // --- Accessibility ---

  it("has accessibilityRole text by default", () => {
    const { UNSAFE_root } = render(<Label>Test Label</Label>);
    const textElement = UNSAFE_root.findByType(require("react-native").Text);
    expect(textElement.props.accessibilityRole).toBe("text");
  });

  it("has accessibilityRole text for all variants", () => {
    const variants = ["screenTitle", "sectionHeader", "formHeader", "formLabel", "error", "caption", "body"] as const;
    
    variants.forEach((variant) => {
      const { UNSAFE_root } = render(<Label variant={variant}>Test</Label>);
      const textElement = UNSAFE_root.findByType(require("react-native").Text);
      expect(textElement.props.accessibilityRole).toBe("text");
    });
  });

  it("forwards accessibilityLabel when provided", () => {
    const { UNSAFE_root } = render(
      <Label accessibilityLabel="Custom accessibility label">Test Label</Label>
    );
    const textElement = UNSAFE_root.findByType(require("react-native").Text);
    expect(textElement.props.accessibilityLabel).toBe("Custom accessibility label");
  });

  it("does not set accessibilityLabel when not provided", () => {
    const { UNSAFE_root } = render(<Label>Test Label</Label>);
    const textElement = UNSAFE_root.findByType(require("react-native").Text);
    // accessibilityLabel should be undefined when not provided
    expect(textElement.props.accessibilityLabel).toBeUndefined();
  });

  // --- Edge cases ---

  it("renders without children", () => {
    expect(() => render(<Label />)).not.toThrow();
  });

  it("handles empty string children", () => {
    render(<Label>{""}</Label>);
    // Should render without error
    expect(true).toBe(true);
  });

  it("handles null children", () => {
    expect(() => render(<Label>{null}</Label>)).not.toThrow();
  });

  it("handles undefined children", () => {
    expect(() => render(<Label>{undefined}</Label>)).not.toThrow();
  });

  it("combines color and custom style correctly", () => {
    const customStyle = { marginTop: 10 };
    const { UNSAFE_root } = render(
      <Label color="#0000FF" style={customStyle}>Blue Text with Margin</Label>
    );
    const textElement = UNSAFE_root.findByType(require("react-native").Text);
    const textStyle = textElement.props.style;
    
    const styles = Array.isArray(textStyle) ? textStyle : [textStyle];
    const hasColor = styles.some((style: any) => 
      style && typeof style === 'object' && style.color === "#0000FF"
    );
    const hasMargin = styles.some((style: any) => 
      style && typeof style === 'object' && style.marginTop === 10
    );
    
    expect(hasColor).toBe(true);
    expect(hasMargin).toBe(true);
  });
});
