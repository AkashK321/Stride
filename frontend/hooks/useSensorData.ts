/**
 * Custom hook for collecting sensor data for navigation frames.
 *
 * Subscribes to GPS, accelerometer, and gyroscope sensors.
 * Compass heading for UI and frames comes from `useHeading` (single expo-location heading subscription).
 * Stores latest readings in refs so they can be sampled when each frame is sent.
 * Cleans up all subscriptions when the component unmounts.
 *
 * Note: Expo's Accelerometer returns values in G-force (1G ≈ 9.81 m/s²).
 * We send the raw G-force values — the backend or spec can handle conversion if needed.
 */

import * as React from "react";
import * as Location from "expo-location";
import { Accelerometer, Gyroscope } from "expo-sensors";

export interface GpsData {
  latitude: number;
  longitude: number;
  altitude: number | null;
  accuracy: number | null;
  altitude_accuracy: number | null;
  speed: number | null;
}

export interface AccelerometerData {
  x: number;
  y: number;
  z: number;
}

export interface GyroscopeData {
  x: number;
  y: number;
  z: number;
}

export interface SensorSnapshot {
  gps: GpsData | null;
  accelerometer: AccelerometerData | null;
  gyroscope: GyroscopeData | null;
}

export interface UseSensorDataReturn {
  /** Get a snapshot of the current sensor readings */
  getSnapshot: () => SensorSnapshot;
  /** Whether location permission has been granted */
  hasLocationPermission: boolean;
  /** Start sensor subscriptions */
  start: () => Promise<void>;
  /** Stop sensor subscriptions */
  stop: () => void;
  /** Whether sensors are currently active */
  isActive: boolean;
}

export function useSensorData(): UseSensorDataReturn {
  const [hasLocationPermission, setHasLocationPermission] = React.useState(false);
  const [isActive, setIsActive] = React.useState(false);

  // Store latest readings in refs for instant access without re-renders
  const gpsRef = React.useRef<GpsData | null>(null);
  const accelerometerRef = React.useRef<AccelerometerData | null>(null);
  const gyroscopeRef = React.useRef<GyroscopeData | null>(null);

  // Store subscription cleanup functions
  const subscriptionsRef = React.useRef<Array<{ remove: () => void }>>([]);
  const locationWatchRef = React.useRef<Location.LocationSubscription | null>(null);

  const start = React.useCallback(async () => {
    if (isActive) return;

    // Request location permission
    const { status } = await Location.requestForegroundPermissionsAsync();
    const locationGranted = status === "granted";
    setHasLocationPermission(locationGranted);

    // GPS subscription
    if (locationGranted) {
      try {
        const locationSub = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.High,
            timeInterval: 1000,
            distanceInterval: 0,
          },
          (location) => {
            gpsRef.current = {
              latitude: location.coords.latitude,
              longitude: location.coords.longitude,
              altitude: location.coords.altitude,
              accuracy: location.coords.accuracy,
              altitude_accuracy: location.coords.altitudeAccuracy,
              speed: location.coords.speed,
            };
          },
        );
        locationWatchRef.current = locationSub;
      } catch (e) {
        console.warn("Failed to start GPS watch:", e);
      }
    }

    // Accelerometer subscription
    try {
      Accelerometer.setUpdateInterval(100); // 100ms
      const accelSub = Accelerometer.addListener((data) => {
        accelerometerRef.current = {
          x: data.x,
          y: data.y,
          z: data.z,
        };
      });
      subscriptionsRef.current.push(accelSub);
    } catch (e) {
      console.warn("Failed to start accelerometer:", e);
    }

    // Gyroscope subscription
    try {
      Gyroscope.setUpdateInterval(100); // 100ms
      const gyroSub = Gyroscope.addListener((data) => {
        gyroscopeRef.current = {
          x: data.x,
          y: data.y,
          z: data.z,
        };
      });
      subscriptionsRef.current.push(gyroSub);
    } catch (e) {
      console.warn("Failed to start gyroscope:", e);
    }

    setIsActive(true);
  }, [isActive]);

  const stop = React.useCallback(() => {
    // Remove expo-sensors subscriptions
    subscriptionsRef.current.forEach((sub) => sub.remove());
    subscriptionsRef.current = [];

    // Remove location subscriptions
    locationWatchRef.current?.remove();
    locationWatchRef.current = null;

    setIsActive(false);
  }, []);

  // Cleanup on unmount
  React.useEffect(() => {
    return () => {
      stop();
    };
  }, [stop]);

  const getSnapshot = React.useCallback((): SensorSnapshot => {
    return {
      gps: gpsRef.current,
      accelerometer: accelerometerRef.current,
      gyroscope: gyroscopeRef.current,
    };
  }, []);

  return {
    getSnapshot,
    hasLocationPermission,
    start,
    stop,
    isActive,
  };
}
