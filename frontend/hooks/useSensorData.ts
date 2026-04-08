/**
 * Custom hook for collecting sensor data for navigation frames.
 *
 * Subscribes to GPS, heading, accelerometer, and gyroscope sensors.
 * Stores latest readings in refs so they can be sampled when each frame is sent.
 * Cleans up all subscriptions when the component unmounts.
 *
 * Note: Expo's Accelerometer returns values in G-force (1G ≈ 9.81 m/s²).
 * We send the raw G-force values — the backend or spec can handle conversion if needed.
 */

import * as React from "react";
import * as Location from "expo-location";
import { Accelerometer, Gyroscope, Pedometer } from "expo-sensors";
import { headingDegreesFromExpoHeading } from "../utils/locationHeading";

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
  heading: number | null;
  gps: GpsData | null;
  accelerometer: AccelerometerData | null;
  gyroscope: GyroscopeData | null;
  distanceDeltaFeet: number;
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

const STRIDE_LENGTH_FEET = 2.3; // Average stride length in feet
const DISTANCE_INTERPOLATION_ENABLED = process.env.ENABLE_DISTANCE_INTERPOLATION === "true";

export function useSensorData(): UseSensorDataReturn {
  const [hasLocationPermission, setHasLocationPermission] = React.useState(false);
  const [isActive, setIsActive] = React.useState(false);

  // Store latest readings in refs for instant access without re-renders
  const headingRef = React.useRef<number | null>(null);
  const gpsRef = React.useRef<GpsData | null>(null);
  const accelerometerRef = React.useRef<AccelerometerData | null>(null);
  const gyroscopeRef = React.useRef<GyroscopeData | null>(null);

  // Pedometer refs for interpolation
  const pedometerSubRef = React.useRef<{ remove: () => void } | null>(null);
  const lastPedometerStepsRef = React.useRef(0);
  const lastPedometerTimeRef = React.useRef(0);
  const speedRef = React.useRef(0);
  const lastSnapshotStepsRef = React.useRef(0);

  // Store subscription cleanup functions
  const subscriptionsRef = React.useRef<Array<{ remove: () => void }>>([]);
  const locationWatchRef = React.useRef<Location.LocationSubscription | null>(null);
  const headingWatchRef = React.useRef<Location.LocationSubscription | null>(null);

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

      // Heading subscription
      try {
        const headingSub = await Location.watchHeadingAsync((heading) => {
          headingRef.current = headingDegreesFromExpoHeading(heading);
        });
        headingWatchRef.current = headingSub;
      } catch (e) {
        console.warn("Failed to start heading watch:", e);
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

    // Pedometer subscription for distance tracking
    try {
      const pedoPerm = await Pedometer.requestPermissionsAsync();
      if (pedoPerm.granted) {
        const pedoSub = Pedometer.watchStepCount((result) => {
          const now = Date.now();
          if (lastPedometerTimeRef.current !== 0) {
            const deltaSteps = result.steps - lastPedometerStepsRef.current;
            const deltaTime = now - lastPedometerTimeRef.current;
            if (deltaTime > 0) {
              speedRef.current = deltaSteps / deltaTime; // update average speed
            }
          } else {
            speedRef.current = 0; // initial reading
            lastSnapshotStepsRef.current = result.steps;
          }
          lastPedometerStepsRef.current = result.steps;
          lastPedometerTimeRef.current = now;
        });
        pedometerSubRef.current = pedoSub;
      }
    } catch (e) {
      console.warn("Failed to start pedometer:", e);
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
    headingWatchRef.current?.remove();
    headingWatchRef.current = null;

    // Remove pedometer subscription
    pedometerSubRef.current?.remove();
    pedometerSubRef.current = null;
    lastPedometerStepsRef.current = 0;
    lastPedometerTimeRef.current = 0;
    lastSnapshotStepsRef.current = 0;
    speedRef.current = 0;

    setIsActive(false);
  }, []);

  // Cleanup on unmount
  React.useEffect(() => {
    return () => {
      stop();
    };
  }, [stop]);

  const getSnapshot = React.useCallback((): SensorSnapshot => {
    const now = Date.now();
    let currentSpeed = speedRef.current;
    const timeSincePedo = now - lastPedometerTimeRef.current;

    // Estimate current total steps based on last known steps + interpolated speed
    var estimatedTotalSteps = lastPedometerStepsRef.current
    if (DISTANCE_INTERPOLATION_ENABLED) {
        estimatedTotalSteps += (currentSpeed * Math.min(timeSincePedo, 5000));
    }

    let deltaSteps = estimatedTotalSteps - lastSnapshotStepsRef.current;
    if (deltaSteps < 0) deltaSteps = 0;

    lastSnapshotStepsRef.current = estimatedTotalSteps;

    const distanceDeltaFeet = deltaSteps * STRIDE_LENGTH_FEET;
    
    return {
      heading: headingRef.current,
      gps: gpsRef.current,
      accelerometer: accelerometerRef.current,
      gyroscope: gyroscopeRef.current,
      distanceDeltaFeet: distanceDeltaFeet,
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
