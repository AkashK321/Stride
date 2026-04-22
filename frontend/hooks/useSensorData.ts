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
  timeSincePedoMs: number;
  lastPedometerSteps: number;
  effectiveSpeedStepsPerMs: number;
  interpolationApplied: boolean;
  /** Internal cursor for delta bookkeeping between snapshots. */
  estimatedTotalSteps: number;
}

export interface GetSnapshotOptions {
  /**
   * When true (default), advances the internal distance baseline.
   * Use false for peek-only reads (e.g. collision frames).
   */
  consumeDistance?: boolean;
}

export interface UseSensorDataReturn {
  /** Get a snapshot of the current sensor readings */
  getSnapshot: (options?: GetSnapshotOptions) => SensorSnapshot;
  /** Get a snapshot that consumes distance for local progression ticks. */
  getProgressSnapshot: () => SensorSnapshot;
  /** Whether location permission has been granted */
  hasLocationPermission: boolean;
  /** Whether pedometer permission has been granted */
  hasPedometerPermission: boolean;
  /** Start sensor subscriptions */
  start: () => Promise<void>;
  /** Stop sensor subscriptions */
  stop: () => void;
  /** Whether sensors are currently active */
  isActive: boolean;
}

const STRIDE_LENGTH_FEET = 2.3; // Average stride length in feet
const MIN_SPEED_SAMPLE_INTERVAL_MS = 250;
const MAX_STEPS_PER_MS = 0.004; // ~4 steps/sec upper bound for walking/running
const SPEED_HOLD_WINDOW_MS = 2500; // Keep last known speed briefly across sparse pedometer callbacks

export function useSensorData(): UseSensorDataReturn {
  const [hasLocationPermission, setHasLocationPermission] = React.useState(false);
  const [hasPedometerPermission, setHasPedometerPermission] = React.useState(false);
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
  const lastSpeedUpdateTimeRef = React.useRef(0);
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
    const pedoPerm = await Pedometer.requestPermissionsAsync();
    console.log(`Pedometer permission status: ${pedoPerm.status}`);
    const pedoGranted = pedoPerm.granted;
    setHasPedometerPermission(pedoGranted);
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
      if (pedoGranted) {
        console.log("Pedometer permission granted, starting step count watch");
        const pedoSub = Pedometer.watchStepCount((result) => {
          const now = Date.now();
          // console.log(`Pedometer update: ${result.steps} steps at ${now}`);
          if (lastPedometerTimeRef.current !== 0) {
            const deltaSteps = result.steps - lastPedometerStepsRef.current;
            const deltaTime = now - lastPedometerTimeRef.current;
            if (deltaTime >= MIN_SPEED_SAMPLE_INTERVAL_MS) {
              if (deltaSteps > 0) {
                const rawSpeed = deltaSteps / deltaTime;
                speedRef.current = Math.min(rawSpeed, MAX_STEPS_PER_MS);
                lastSpeedUpdateTimeRef.current = now;
              } else if (deltaSteps < 0) {
                // Counter reset or anomaly: drop interpolation speed.
                speedRef.current = 0;
                lastSpeedUpdateTimeRef.current = now;
              }
            }
          } else {
            speedRef.current = 0; // initial reading
            lastSpeedUpdateTimeRef.current = now;
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
    lastSpeedUpdateTimeRef.current = 0;

    setIsActive(false);
  }, []);

  // Cleanup on unmount
  React.useEffect(() => {
    return () => {
      stop();
    };
  }, [stop]);

  const getSnapshot = React.useCallback((options?: GetSnapshotOptions): SensorSnapshot => {
    const now = Date.now();
    const speedAgeMs = now - lastSpeedUpdateTimeRef.current;
    const currentSpeed =
      speedRef.current > 0 && speedAgeMs <= SPEED_HOLD_WINDOW_MS
        ? speedRef.current
        : 0;
    const consumeDistance = options?.consumeDistance ?? true;
    const timeSincePedo = now - lastPedometerTimeRef.current;
    // console.log(`Time since last pedometer update: ${timeSincePedo}ms, current speed: ${currentSpeed} steps/ms`);

    // Use raw pedometer totals only (no interpolation) for stable progression.
    const estimatedTotalSteps = lastPedometerStepsRef.current;
    const interpolationApplied = false;

    let deltaSteps = estimatedTotalSteps - lastSnapshotStepsRef.current;
    if (deltaSteps < 0) deltaSteps = 0;

    if (consumeDistance) {
      lastSnapshotStepsRef.current = estimatedTotalSteps;
    }

    const distanceDeltaFeet = deltaSteps * STRIDE_LENGTH_FEET;

    return {
      heading: headingRef.current,
      gps: gpsRef.current,
      accelerometer: accelerometerRef.current,
      gyroscope: gyroscopeRef.current,
      distanceDeltaFeet,
      timeSincePedoMs: timeSincePedo,
      lastPedometerSteps: lastPedometerStepsRef.current,
      effectiveSpeedStepsPerMs: currentSpeed,
      interpolationApplied,
      estimatedTotalSteps,
    };
  }, []);
  const getProgressSnapshot = React.useCallback(() => {
    return getSnapshot({ consumeDistance: true });
  }, [getSnapshot]);

  return {
    getSnapshot,
    getProgressSnapshot,
    hasLocationPermission,
    hasPedometerPermission,
    start,
    stop,
    isActive,
  };
}
