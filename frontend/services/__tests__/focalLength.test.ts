/**
 * Unit tests for focalLength.ts
 */

import * as Device from "expo-device";
import { getFocalLengthPixels } from "../focalLength";

// Mock expo-device
jest.mock("expo-device", () => ({
  modelName: null,
}));

describe("getFocalLengthPixels", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset to default state
    (Device as any).modelName = null;
  });

  it("returns default when modelName is null", () => {
    (Device as any).modelName = null;
    const result = getFocalLengthPixels();
    expect(result).toBe(1400);
  });

  it("returns default when modelName is undefined", () => {
    (Device as any).modelName = undefined;
    const result = getFocalLengthPixels();
    expect(result).toBe(1400);
  });

  it("returns default for unknown device", () => {
    (Device as any).modelName = "Unknown Device XYZ";
    const result = getFocalLengthPixels();
    expect(result).toBe(1400);
  });

  it("calculates correctly for iPhone 16 Pro with default image width", () => {
    (Device as any).modelName = "iPhone 16 Pro";
    // Spec: { focalLengthMm: 6.765, sensorWidthMm: 9.8 }
    // Formula: (6.765 / 9.8) * 1920 = 1325.387...
    const result = getFocalLengthPixels();
    expect(result).toBe(1325.39); // Rounded to 2 decimal places
  });

  it("calculates correctly for iPhone 16 Pro with custom image width", () => {
    (Device as any).modelName = "iPhone 16 Pro";
    // Spec: { focalLengthMm: 6.765, sensorWidthMm: 9.8 }
    // Formula: (6.765 / 9.8) * 3840 = 2650.775...
    const result = getFocalLengthPixels(3840);
    expect(result).toBe(2650.78); // Rounded to 2 decimal places
  });

  it("calculates correctly for iPhone 14 with default image width", () => {
    (Device as any).modelName = "iPhone 14";
    // Spec: { focalLengthMm: 5.7, sensorWidthMm: 7.0 }
    // Formula: (5.7 / 7.0) * 1920 = 1563.428...
    const result = getFocalLengthPixels();
    expect(result).toBe(1563.43); // Rounded to 2 decimal places
  });

  it("calculates correctly for iPhone 12 Pro with default image width", () => {
    (Device as any).modelName = "iPhone 12 Pro";
    // Spec: { focalLengthMm: 4.2, sensorWidthMm: 5.6 }
    // Formula: (4.2 / 5.6) * 1920 = 1440.0
    const result = getFocalLengthPixels();
    expect(result).toBe(1440.0);
  });

  it("calculates correctly for Galaxy S24 Ultra with default image width", () => {
    (Device as any).modelName = "Galaxy S24 Ultra";
    // Spec: { focalLengthMm: 6.3, sensorWidthMm: 8.16 }
    // Formula: (6.3 / 8.16) * 1920 = 1482.352...
    const result = getFocalLengthPixels();
    expect(result).toBe(1482.35); // Rounded to 2 decimal places
  });

  it("calculates correctly for Galaxy S24 Ultra model number", () => {
    (Device as any).modelName = "SM-S928B";
    // Spec: { focalLengthMm: 6.3, sensorWidthMm: 8.16 }
    // Formula: (6.3 / 8.16) * 1920 = 1482.352...
    const result = getFocalLengthPixels();
    expect(result).toBe(1482.35); // Rounded to 2 decimal places
  });

  it("calculates correctly for Pixel 8 Pro with default image width", () => {
    (Device as any).modelName = "Pixel 8 Pro";
    // Spec: { focalLengthMm: 6.9, sensorWidthMm: 8.2 }
    // Formula: (6.9 / 8.2) * 1920 = 1615.609...
    const result = getFocalLengthPixels();
    expect(result).toBe(1615.61); // Rounded to 2 decimal places
  });

  it("calculates correctly for Pixel 6 with default image width", () => {
    (Device as any).modelName = "Pixel 6";
    // Spec: { focalLengthMm: 6.81, sensorWidthMm: 7.0 }
    // Formula: (6.81 / 7.0) * 1920 = 1867.885...
    const result = getFocalLengthPixels();
    expect(result).toBe(1867.89); // Rounded to 2 decimal places
  });

  it("rounds result to 2 decimal places", () => {
    (Device as any).modelName = "iPhone 16 Pro";
    // This will produce a value with more than 2 decimal places
    // (6.765 / 9.8) * 1920 = 1325.3877551020408
    const result = getFocalLengthPixels();
    expect(result).toBe(1325.39);
    // Verify it's actually rounded, not just truncated
    expect(result.toString().split(".")[1]?.length).toBeLessThanOrEqual(2);
  });

  it("handles very small image width", () => {
    (Device as any).modelName = "iPhone 16 Pro";
    // Spec: { focalLengthMm: 6.765, sensorWidthMm: 9.8 }
    // Formula: (6.765 / 9.8) * 100 = 69.030...
    const result = getFocalLengthPixels(100);
    expect(result).toBe(69.03); // Rounded to 2 decimal places
  });

  it("handles very large image width", () => {
    (Device as any).modelName = "iPhone 16 Pro";
    // Spec: { focalLengthMm: 6.765, sensorWidthMm: 9.8 }
    // Formula: (6.765 / 9.8) * 7680 = 5301.551...
    const result = getFocalLengthPixels(7680);
    expect(result).toBe(5301.55); // Rounded to 2 decimal places
  });

  it("handles zero image width", () => {
    (Device as any).modelName = "iPhone 16 Pro";
    // Spec: { focalLengthMm: 6.765, sensorWidthMm: 9.8 }
    // Formula: (6.765 / 9.8) * 0 = 0
    const result = getFocalLengthPixels(0);
    expect(result).toBe(0);
  });

  it("handles all iPhone models in the specs", () => {
    const iphoneModels = [
      "iPhone 16 Pro Max",
      "iPhone 16 Pro",
      "iPhone 16",
      "iPhone 15 Pro Max",
      "iPhone 15 Pro",
      "iPhone 15",
      "iPhone 15 Plus",
      "iPhone 14 Pro Max",
      "iPhone 14 Pro",
      "iPhone 14",
      "iPhone 13 Pro Max",
      "iPhone 13 Pro",
      "iPhone 13",
      "iPhone 12 Pro Max",
      "iPhone 12 Pro",
      "iPhone 12",
      "iPhone 11 Pro Max",
      "iPhone 11 Pro",
      "iPhone 11",
    ];

    iphoneModels.forEach((model) => {
      (Device as any).modelName = model;
      const result = getFocalLengthPixels();
      expect(result).toBeGreaterThan(0);
      expect(result).not.toBe(1400); // Should not be the default
      expect(typeof result).toBe("number");
    });
  });

  it("handles all Samsung Galaxy models in the specs", () => {
    const samsungModels = [
      "Galaxy S24 Ultra",
      "Galaxy S24+",
      "Galaxy S24",
      "Galaxy S23 Ultra",
      "Galaxy S23+",
      "Galaxy S23",
      "SM-S928B",
      "SM-S921B",
    ];

    samsungModels.forEach((model) => {
      (Device as any).modelName = model;
      const result = getFocalLengthPixels();
      expect(result).toBeGreaterThan(0);
      expect(result).not.toBe(1400); // Should not be the default
      expect(typeof result).toBe("number");
    });
  });

  it("handles all Google Pixel models in the specs", () => {
    const pixelModels = [
      "Pixel 8 Pro",
      "Pixel 8",
      "Pixel 7 Pro",
      "Pixel 7",
      "Pixel 6 Pro",
      "Pixel 6",
    ];

    pixelModels.forEach((model) => {
      (Device as any).modelName = model;
      const result = getFocalLengthPixels();
      expect(result).toBeGreaterThan(0);
      expect(result).not.toBe(1400); // Should not be the default
      expect(typeof result).toBe("number");
    });
  });

  it("uses default image width when not provided", () => {
    (Device as any).modelName = "iPhone 16 Pro";
    const result1 = getFocalLengthPixels();
    const result2 = getFocalLengthPixels(1920);
    expect(result1).toBe(result2);
  });

  it("logs warning when modelName is null", () => {
    const consoleSpy = jest.spyOn(console, "warn").mockImplementation();
    (Device as any).modelName = null;
    
    getFocalLengthPixels();
    
    expect(consoleSpy).toHaveBeenCalledWith(
      "Device model unknown, using default focal length:",
      1400
    );
    
    consoleSpy.mockRestore();
  });

  it("logs warning when device is not in specs", () => {
    const consoleSpy = jest.spyOn(console, "warn").mockImplementation();
    (Device as any).modelName = "Unknown Device";
    
    getFocalLengthPixels();
    
    expect(consoleSpy).toHaveBeenCalledWith(
      'No camera spec for device "Unknown Device", using default focal length:',
      1400
    );
    
    consoleSpy.mockRestore();
  });
});
