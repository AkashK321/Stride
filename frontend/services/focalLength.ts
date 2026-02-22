/**
 * Focal length service for computing focal length in pixels from device model.
 *
 * Uses expo-device to detect the current device, then looks up the physical
 * focal length (mm) and sensor width (mm) from a hardcoded device map.
 * Computes focal length in pixels: f_pixels = (f_mm / sensor_width_mm) * image_width_pixels
 *
 * Falls back to a reasonable default (1400) for unknown devices.
 */

import * as Device from "expo-device";

/** Default focal length in pixels when device is unknown */
const DEFAULT_FOCAL_LENGTH_PIXELS = 1400;

/** Default image width captured by expo-camera at quality 0.5 */
const DEFAULT_IMAGE_WIDTH_PIXELS = 1920;

/**
 * Device camera specs: focal length in mm and sensor width in mm.
 * These are approximate values for the main (wide) camera on each device.
 */
interface CameraSpec {
  focalLengthMm: number;
  sensorWidthMm: number;
}

const DEVICE_CAMERA_SPECS: Record<string, CameraSpec> = {
  // iPhone models
  "iPhone 16 Pro Max": { focalLengthMm: 6.765, sensorWidthMm: 9.8 },
  "iPhone 16 Pro": { focalLengthMm: 6.765, sensorWidthMm: 9.8 },
  "iPhone 16": { focalLengthMm: 6.765, sensorWidthMm: 7.0 },
  "iPhone 15 Pro Max": { focalLengthMm: 6.765, sensorWidthMm: 9.8 },
  "iPhone 15 Pro": { focalLengthMm: 6.765, sensorWidthMm: 9.8 },
  "iPhone 15": { focalLengthMm: 6.765, sensorWidthMm: 7.0 },
  "iPhone 15 Plus": { focalLengthMm: 6.765, sensorWidthMm: 7.0 },
  "iPhone 14 Pro Max": { focalLengthMm: 6.86, sensorWidthMm: 9.8 },
  "iPhone 14 Pro": { focalLengthMm: 6.86, sensorWidthMm: 9.8 },
  "iPhone 14": { focalLengthMm: 5.7, sensorWidthMm: 7.0 },
  "iPhone 13 Pro Max": { focalLengthMm: 5.7, sensorWidthMm: 7.0 },
  "iPhone 13 Pro": { focalLengthMm: 5.7, sensorWidthMm: 7.0 },
  "iPhone 13": { focalLengthMm: 5.1, sensorWidthMm: 7.0 },
  "iPhone 12 Pro Max": { focalLengthMm: 5.1, sensorWidthMm: 7.0 },
  "iPhone 12 Pro": { focalLengthMm: 4.2, sensorWidthMm: 5.6 },
  "iPhone 12": { focalLengthMm: 4.2, sensorWidthMm: 5.6 },
  "iPhone 11 Pro Max": { focalLengthMm: 4.25, sensorWidthMm: 5.6 },
  "iPhone 11 Pro": { focalLengthMm: 4.25, sensorWidthMm: 5.6 },
  "iPhone 11": { focalLengthMm: 4.25, sensorWidthMm: 5.6 },

  // Samsung Galaxy models
  "Galaxy S24 Ultra": { focalLengthMm: 6.3, sensorWidthMm: 8.16 },
  "Galaxy S24+": { focalLengthMm: 6.3, sensorWidthMm: 7.0 },
  "Galaxy S24": { focalLengthMm: 6.3, sensorWidthMm: 7.0 },
  "Galaxy S23 Ultra": { focalLengthMm: 6.3, sensorWidthMm: 8.16 },
  "Galaxy S23+": { focalLengthMm: 6.3, sensorWidthMm: 7.0 },
  "Galaxy S23": { focalLengthMm: 6.3, sensorWidthMm: 7.0 },
  "SM-S928B": { focalLengthMm: 6.3, sensorWidthMm: 8.16 }, // S24 Ultra model number
  "SM-S921B": { focalLengthMm: 6.3, sensorWidthMm: 7.0 }, // S24 model number

  // Google Pixel models
  "Pixel 8 Pro": { focalLengthMm: 6.9, sensorWidthMm: 8.2 },
  "Pixel 8": { focalLengthMm: 6.81, sensorWidthMm: 7.0 },
  "Pixel 7 Pro": { focalLengthMm: 6.81, sensorWidthMm: 8.2 },
  "Pixel 7": { focalLengthMm: 6.81, sensorWidthMm: 7.0 },
  "Pixel 6 Pro": { focalLengthMm: 6.81, sensorWidthMm: 8.2 },
  "Pixel 6": { focalLengthMm: 6.81, sensorWidthMm: 7.0 },
};

/**
 * Computes the focal length in pixels for the current device.
 *
 * @param imageWidthPixels - The width of the captured image in pixels (default: 1920)
 * @returns The focal length in pixels, or the default value for unknown devices
 */
export function getFocalLengthPixels(
  imageWidthPixels: number = DEFAULT_IMAGE_WIDTH_PIXELS,
): number {
  const modelName = Device.modelName;

  if (!modelName) {
    console.warn(
      "Device model unknown, using default focal length:",
      DEFAULT_FOCAL_LENGTH_PIXELS,
    );
    return DEFAULT_FOCAL_LENGTH_PIXELS;
  }

  const spec = DEVICE_CAMERA_SPECS[modelName];

  if (!spec) {
    console.warn(
      `No camera spec for device "${modelName}", using default focal length:`,
      DEFAULT_FOCAL_LENGTH_PIXELS,
    );
    return DEFAULT_FOCAL_LENGTH_PIXELS;
  }

  const focalLengthPixels =
    (spec.focalLengthMm / spec.sensorWidthMm) * imageWidthPixels;

  return Math.round(focalLengthPixels * 100) / 100; // Round to 2 decimal places
}
