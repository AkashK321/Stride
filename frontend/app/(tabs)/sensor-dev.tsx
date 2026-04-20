/**
 * Sensor Dev screen - development tool for IMU data collection.
 *
 * DEV ONLY - This entire file should be deleted before production release.
 * 
 * This screen provides tools for:
 * - Recording IMU sensor data (accelerometer, gyroscope, magnetometer) to CSV files
 * - Monitoring real-time sensor readings
 * - Previewing localization-style heading (expo-location, same as navigation payloads)
 * - Dead-reckoning test runs (sub-tab), separate from CSV sensor logging (sub-tab)
 *
 * Uses React.createElement (non-JSX) to match the project's TypeScript configuration.
 */
import * as React from "react";
import { View, Text, ScrollView, Alert, TextInput, Pressable, Modal } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Pedometer } from "expo-sensors";
import * as Device from "expo-device";
import Button from "../../components/Button";
import NodePickerModal from "../../components/dev/NodePickerModal";
import SensorService from "../../services/SensorService";
import { FLOOR2_NODES } from "../../data/floor2Nodes";
import type { SensorReading, LocalizationData } from "../../services/SensorService";
import { colors } from "../../theme/colors";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";

type DeadReckoningSample = {
  timestamp_ms: number;
  heading_raw_deg: number;
  heading_avg_deg: number;
  pedometer_steps: number;
  step_delta: number;
  estimated_distance_m: number;
};

const DEFAULT_STEP_LENGTH_M = 0.7;
const HEADING_WINDOW_SIZE = 10;
const TEST_SAMPLE_INTERVAL_MS = 200;
/** Floors supported for dead-reckoning CSV / graph alignment (logger + plot_runs). */
const DEAD_RECKONING_FLOOR_OPTIONS = [2] as const;

const DEAD_RECKONING_FIELD_MIN_HEIGHT = 48;
const DEAD_RECKONING_PLACEHOLDER_COLOR = colors.placeholder;

function deadReckoningInputStyle(editable: boolean) {
  return {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 8,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    backgroundColor: editable ? "#FFFFFF" : "#F3F4F6",
    minHeight: DEAD_RECKONING_FIELD_MIN_HEIGHT,
    width: "100%" as const,
    color: colors.text,
  };
}

function deadReckoningFloorDropdownStyle(disabled: boolean) {
  return {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 8,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    backgroundColor: disabled ? "#F3F4F6" : "#FFFFFF",
    minHeight: DEAD_RECKONING_FIELD_MIN_HEIGHT,
    width: "100%" as const,
  };
}

const DEAD_RECKONING_LOGGER_BASE = (
  process.env.EXPO_PUBLIC_DEAD_RECKONING_LOGGER_URL ||
  process.env.EXPO_PUBLIC_DEV_LOGGER_URL ||
  "http://localhost:3001"
).replace(/\/+$/, "").replace(/\/log$/, "");

function normalizeHeading(deg: number): number {
  let value = deg % 360;
  if (value < 0) value += 360;
  return value;
}

function circularMean(values: number[]): number {
  if (values.length === 0) return 0;
  let sinSum = 0;
  let cosSum = 0;
  for (const angleDeg of values) {
    const r = (angleDeg * Math.PI) / 180;
    sinSum += Math.sin(r);
    cosSum += Math.cos(r);
  }
  const mean = (Math.atan2(sinSum / values.length, cosSum / values.length) * 180) / Math.PI;
  return normalizeHeading(mean);
}

export default function SensorDevScreen() {
  const [isLogging, setIsLogging] = React.useState(false);
  const [sessionId, setSessionId] = React.useState<string | null>(null);
  const [sampleCount, setSampleCount] = React.useState(0);
  const [currentReading, setCurrentReading] = React.useState<SensorReading | null>(null);
  const [localization, setLocalization] = React.useState<LocalizationData | null>(null);
  const [sessions, setSessions] = React.useState<string[]>([]);
  const [showSessions, setShowSessions] = React.useState(false);
  const [isMonitoring, setIsMonitoring] = React.useState(false);
  const [isTestModeRecording, setIsTestModeRecording] = React.useState(false);
  const [testStartedAtMs, setTestStartedAtMs] = React.useState<number | null>(null);
  const [testRunNumber, setTestRunNumber] = React.useState("");
  const [deadReckoningFloor, setDeadReckoningFloor] = React.useState<number>(2);
  const [testGroundTruthDistanceM, setTestGroundTruthDistanceM] = React.useState("");
  const [testerName, setTesterName] = React.useState("");
  const [testerDeviceModel, setTesterDeviceModel] = React.useState("");
  const [pedometerAvailable, setPedometerAvailable] = React.useState<boolean | null>(null);
  const [pedometerStepsRaw, setPedometerStepsRaw] = React.useState(0);
  const [runElapsedSeconds, setRunElapsedSeconds] = React.useState(0);
  const [runSampleCount, setRunSampleCount] = React.useState(0);
  const [runHeadingRaw, setRunHeadingRaw] = React.useState<number | null>(null);
  const [runHeadingAvg, setRunHeadingAvg] = React.useState<number | null>(null);
  const [runPedometerSteps, setRunPedometerSteps] = React.useState(0);
  const [runEstimatedDistanceM, setRunEstimatedDistanceM] = React.useState(0);
  const [activeTestRunId, setActiveTestRunId] = React.useState<string | null>(null);
  const [overlayStartNodeId, setOverlayStartNodeId] = React.useState("");
  const [overlayEndNodeId, setOverlayEndNodeId] = React.useState("");
  const [nodePickerVisible, setNodePickerVisible] = React.useState(false);
  const [nodePickerRole, setNodePickerRole] = React.useState<"start" | "end" | null>(null);
  const [subTab, setSubTab] = React.useState<"logging" | "deadReckoning">("logging");
  const [floorDropdownVisible, setFloorDropdownVisible] = React.useState(false);

  const currentReadingRef = React.useRef<SensorReading | null>(null);
  const localizationRef = React.useRef<LocalizationData | null>(null);
  const pedometerStepsRawRef = React.useRef(0);
  const testTimerRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const testSamplesRef = React.useRef<DeadReckoningSample[]>([]);
  const headingHistoryRef = React.useRef<number[]>([]);
  const pedometerBaselineRef = React.useRef(0);
  const prevRelativeStepsRef = React.useRef(0);
  const postDeadReckoningLog = React.useCallback(async (endpoint: string, payload: unknown) => {
    try {
      await fetch(`${DEAD_RECKONING_LOGGER_BASE}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch (error) {
      console.warn("[dead-reckoning] local logger request failed:", endpoint, error);
    }
  }, []);


  React.useEffect(() => {
    // Don't auto-start monitoring - let user control it

    const unsubscribeUpdates = SensorService.subscribeToUpdates((reading) => {
      setCurrentReading(reading);
      currentReadingRef.current = reading;
      if (SensorService.isCurrentlyLogging()) {
        setSampleCount(prev => prev + 1);
      }
    });

    const unsubscribeLocalization = SensorService.subscribeToLocalization((data) => {
      setLocalization(data);
      localizationRef.current = data;
    });

    return () => {
      unsubscribeUpdates();
      unsubscribeLocalization();
      if (testTimerRef.current) {
        clearInterval(testTimerRef.current);
        testTimerRef.current = null;
      }
      SensorService.stopMonitoring(); // Clean up on unmount
    };
  }, []);

  React.useEffect(() => {
    setTesterDeviceModel(Device.modelName ?? "");
  }, []);

  React.useEffect(() => {
    pedometerStepsRawRef.current = pedometerStepsRaw;
  }, [pedometerStepsRaw]);

  React.useEffect(() => {
    let isCancelled = false;
    let subscription: { remove: () => void } | null = null;

    const setupPedometer = async () => {
      try {
        const available = await Pedometer.isAvailableAsync();
        if (isCancelled) return;
        setPedometerAvailable(available);
        if (!available) return;
        subscription = Pedometer.watchStepCount((result) => {
          if (!isCancelled) {
            setPedometerStepsRaw(result.steps);
          }
        });
      } catch (error) {
        console.warn("Pedometer setup failed:", error);
        if (!isCancelled) setPedometerAvailable(false);
      }
    };

    setupPedometer();

    return () => {
      isCancelled = true;
      subscription?.remove();
    };
  }, []);

  const startLogging = async () => {
    try {
      // Start monitoring sensors if not already running
      if (!isMonitoring) {
        SensorService.startMonitoring();
        setIsMonitoring(true);
      }
      
      const newSessionId = await SensorService.startLogging();
      setSessionId(newSessionId);
      setIsLogging(true);
      setSampleCount(0);
      Alert.alert("Success", "Sensor logging started");
    } catch (error) {
      console.error("Error starting logging:", error);
      Alert.alert("Error", "Failed to start logging");
    }
  };

  const stopLogging = async () => {
    try {
      await SensorService.stopLogging();
      setIsLogging(false);
      Alert.alert(
        "Logging Stopped",
        `Session: ${sessionId}\nTotal samples: ${sampleCount}`
      );
      // Keep monitoring running so UI still updates
    } catch (error) {
      console.error("Error stopping logging:", error);
      Alert.alert("Error", "Failed to stop logging");
    }
  };

  const toggleLogging = () => {
    if (isLogging) {
      stopLogging();
    } else {
      startLogging();
    }
  };

  const resetLocalization = () => {
    SensorService.resetLocalization();
    Alert.alert("Reset", "Localization data has been reset");
  };

  const loadSessions = async () => {
    const sessionList = await SensorService.listSessions();
    setSessions(sessionList);
    setShowSessions(true);
  };
  
  const handleExportSession = async (sessionId: string) => {
    try {
      await SensorService.shareSession(sessionId);
    } catch (error) {
      console.error("Export error:", error);
      Alert.alert("Error", "Failed to export session data");
    }
  };
  
  const handleDeleteSession = async (sessionId: string) => {
    Alert.alert(
      "Delete Session",
      `Delete ${sessionId}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            await SensorService.deleteSession(sessionId);
            loadSessions(); // Refresh list
            Alert.alert("Deleted", "Session has been deleted");
          },
        },
      ]
    );
  };

  const startTestModeRun = async () => {
    if (
      !testRunNumber.trim() ||
      !testGroundTruthDistanceM ||
      !testerName.trim() ||
      !testerDeviceModel.trim()
    ) {
      Alert.alert("Missing metadata", "Please fill in test ID, ground truth distance, tester, and device model.");
      return;
    }

    if (!overlayStartNodeId.trim() || !overlayEndNodeId.trim()) {
      Alert.alert("Missing route", "Select start and end graph nodes for the chosen floor.");
      return;
    }

    if (!([...DEAD_RECKONING_FLOOR_OPTIONS] as number[]).includes(deadReckoningFloor)) {
      Alert.alert("Invalid floor", "Choose a supported floor.");
      return;
    }

    if (!isMonitoring) {
      SensorService.startMonitoring();
      setIsMonitoring(true);
    }

    if (!pedometerAvailable) {
      Alert.alert("Pedometer unavailable", "This device does not support pedometer step counting.");
      return;
    }

    headingHistoryRef.current = [];
    testSamplesRef.current = [];
    pedometerBaselineRef.current = pedometerStepsRawRef.current;
    prevRelativeStepsRef.current = 0;
    setRunSampleCount(0);
    setRunElapsedSeconds(0);
    setRunHeadingRaw(null);
    setRunHeadingAvg(null);
    setRunPedometerSteps(0);
    setRunEstimatedDistanceM(0);

    setIsTestModeRecording(true);
    const startedAt = Date.now();
    setTestStartedAtMs(startedAt);
    const runId = `${testRunNumber}-${startedAt}`;
    setActiveTestRunId(runId);

    void postDeadReckoningLog("/run/start", {
      run_id: runId,
      test_id: testRunNumber,
      floor: deadReckoningFloor,
      start_node_id: overlayStartNodeId.trim(),
      end_node_id: overlayEndNodeId.trim(),
      ground_truth_distance_m: Number(testGroundTruthDistanceM),
      tester: testerName,
      device_model: testerDeviceModel,
      started_at_ms: startedAt,
    });

    testTimerRef.current = setInterval(() => {
      const now = Date.now();
      const loc = localizationRef.current;
      const rawHeading = normalizeHeading(
        loc?.headingRawDeg ?? loc?.heading ?? 0
      );
      headingHistoryRef.current.push(rawHeading);
      if (headingHistoryRef.current.length > HEADING_WINDOW_SIZE) {
        headingHistoryRef.current.shift();
      }
      const avgHeading = circularMean(headingHistoryRef.current);

      const relativeSteps = Math.max(0, pedometerStepsRawRef.current - pedometerBaselineRef.current);
      const stepDelta = relativeSteps - prevRelativeStepsRef.current;
      prevRelativeStepsRef.current = relativeSteps;
      const estimatedDistance = relativeSteps * DEFAULT_STEP_LENGTH_M;

      const sample: DeadReckoningSample = {
        timestamp_ms: now,
        heading_raw_deg: rawHeading,
        heading_avg_deg: avgHeading,
        pedometer_steps: relativeSteps,
        step_delta: stepDelta,
        estimated_distance_m: estimatedDistance,
      };
      testSamplesRef.current.push(sample);
      void postDeadReckoningLog("/run/sample", {
        run_id: runId,
        sample,
      });

      setRunSampleCount(testSamplesRef.current.length);
      setRunElapsedSeconds(Math.max(0, (now - startedAt) / 1000));
      setRunHeadingRaw(rawHeading);
      setRunHeadingAvg(avgHeading);
      setRunPedometerSteps(relativeSteps);
      setRunEstimatedDistanceM(estimatedDistance);
    }, TEST_SAMPLE_INTERVAL_MS);

    Alert.alert("Test mode", "Run started. Walk your route, then stop to save summary.");
  };

  const stopTestModeRun = () => {
    if (testTimerRef.current) {
      clearInterval(testTimerRef.current);
      testTimerRef.current = null;
    }
    const stoppedAt = Date.now();
    if (activeTestRunId) {
      void postDeadReckoningLog("/run/end", {
        run_id: activeTestRunId,
        stopped_at_ms: stoppedAt,
        sample_count: testSamplesRef.current.length,
        estimated_distance_m: runEstimatedDistanceM,
      });
    }
    const elapsedMs = testStartedAtMs ? Date.now() - testStartedAtMs : 0;
    setIsTestModeRecording(false);
    setTestStartedAtMs(null);
    setActiveTestRunId(null);
    Alert.alert(
      "Test mode",
      `Run stopped.\nRun #${testRunNumber}\nElapsed: ${(elapsedMs / 1000).toFixed(1)}s\nSamples: ${testSamplesRef.current.length}\nEstimated distance: ${runEstimatedDistanceM.toFixed(2)} m`
    );
  };

  return React.createElement(
    SafeAreaView,
    {
      style: {
        flex: 1,
        // Avoid paddingBottom here: `padding: spacing.lg` reserves space below the ScrollView
        // (dead band above the root tab bar). nav-dev keeps outer flex:1 unpadded.
        paddingTop: spacing.lg,
        paddingHorizontal: spacing.lg,
        paddingBottom: 0,
      },
      // Match nav-dev: only inset top. Bottom inset + tab bar = dead space above tabs.
      edges: ["top"] as const,
    },
    React.createElement(
      ScrollView,
      {
        style: { flex: 1 },
        showsVerticalScrollIndicator: false,
        // Breathing room after the last row when scrolled to the end (not a fixed gap above tabs).
        contentContainerStyle: { paddingBottom: spacing.md },
      },
      React.createElement(
        View,
        {
          style: {
            gap: spacing.lg,
          },
        },
        // Header
        React.createElement(
          View,
          { style: { gap: spacing.xs } },
          React.createElement(
            Text,
            { style: typography.h1 },
            "Sensor Dev Tools"
          ),
        ),

        React.createElement(
          View,
          { style: { gap: spacing.xs, marginBottom: spacing.sm } },
          React.createElement(
            View,
            {
              style: {
                flexDirection: "row",
                gap: spacing.xs,
                backgroundColor: "#E8EBEF",
                padding: 4,
                borderRadius: 10,
              },
            },
            React.createElement(
              Pressable,
              {
                accessibilityRole: "tab",
                accessibilityState: { selected: subTab === "logging" },
                onPress: () => setSubTab("logging"),
                style: {
                  flex: 1,
                  paddingVertical: spacing.sm,
                  paddingHorizontal: spacing.md,
                  borderRadius: 8,
                  backgroundColor: subTab === "logging" ? "#FFFFFF" : "transparent",
                  alignItems: "center",
                },
              },
              React.createElement(
                Text,
                {
                  style: {
                    ...typography.body,
                    fontWeight: subTab === "logging" ? "700" : "500",
                    color: subTab === "logging" ? "#111" : "#555",
                  },
                },
                "Sensor logging"
              )
            ),
            React.createElement(
              Pressable,
              {
                accessibilityRole: "tab",
                accessibilityState: { selected: subTab === "deadReckoning" },
                onPress: () => setSubTab("deadReckoning"),
                style: {
                  flex: 1,
                  paddingVertical: spacing.sm,
                  paddingHorizontal: spacing.md,
                  borderRadius: 8,
                  backgroundColor: subTab === "deadReckoning" ? "#FFFFFF" : "transparent",
                  alignItems: "center",
                },
              },
              React.createElement(
                Text,
                {
                  style: {
                    ...typography.body,
                    fontWeight: subTab === "deadReckoning" ? "700" : "500",
                    color: subTab === "deadReckoning" ? "#111" : "#555",
                  },
                },
                "Dead reckoning"
              )
            )
          )
        ),

        subTab === "logging" &&
          React.createElement(
            React.Fragment,
            null,
        // Status Section
        React.createElement(
          View,
          { style: { gap: spacing.md } },
          React.createElement(
            Text,
            { style: typography.h3 },
            "Status"
          ),
          React.createElement(
            View,
            {
              style: {
                flexDirection: "row",
                alignItems: "center",
                gap: spacing.sm,
              },
            },
            React.createElement(View, {
              style: {
                width: 12,
                height: 12,
                borderRadius: 6,
                backgroundColor: isLogging ? "#4CAF50" : isMonitoring ? "#FFC107" : "#9E9E9E",
              },
            }),
            React.createElement(
              Text,
              { style: typography.body },
              isLogging ? "Logging Active" : isMonitoring ? "Monitoring (No CSV)" : "Idle"
            )
          ),
          !isMonitoring && React.createElement(
            Text,
            {
              style: {
                ...typography.caption,
                fontStyle: "italic",
                color: "#666",
              },
            },
            "Press 'Start Logging' to begin data collection"
          ),
          sessionId && React.createElement(
            Text,
            {
              style: {
                ...typography.caption,
                fontFamily: "monospace",
              },
            },
            `Session: ${sessionId}`
          )
        ),

        // Stats Section
        React.createElement(
          View,
          { style: { gap: spacing.md } },
          React.createElement(
            Text,
            { style: typography.h3 },
            "Statistics"
          ),
          React.createElement(
            View,
            {
              style: {
                flexDirection: "row",
                justifyContent: "space-between",
              },
            },
            React.createElement(
              View,
              { style: { alignItems: "center" } },
              React.createElement(
                Text,
                {
                  style: {
                    ...typography.h2,
                    fontWeight: "bold",
                  },
                },
                sampleCount.toString()
              ),
              React.createElement(
                Text,
                { style: typography.caption },
                "Samples"
              )
            ),
            React.createElement(
              View,
              { style: { alignItems: "center" } },
              React.createElement(
                Text,
                {
                  style: {
                    ...typography.h2,
                    fontWeight: "bold",
                  },
                },
                "100 Hz"
              ),
              React.createElement(
                Text,
                { style: typography.caption },
                "Sample Rate"
              )
            ),
            React.createElement(
              View,
              { style: { alignItems: "center" } },
              React.createElement(
                Text,
                {
                  style: {
                    ...typography.h2,
                    fontWeight: "bold",
                  },
                },
                `${isLogging ? ((sampleCount / 100) | 0) : 0}s`
              ),
              React.createElement(
                Text,
                { style: typography.caption },
                "Duration"
              )
            )
          )
        ),

        React.createElement(
          View,
          { style: { marginTop: spacing.sm } },
          React.createElement(Button, {
            onPress: toggleLogging,
            title: isLogging ? "Stop Logging" : "Start Logging",
            variant: isLogging ? "danger" : "primary",
            loading: false,
          })
        ),

        // Live Sensor Data Section
        currentReading && React.createElement(
          View,
          { style: { gap: spacing.md } },
          React.createElement(
            Text,
            { style: typography.h3 },
            "Live Sensor Data"
          ),
          // Accelerometer
          React.createElement(
            View,
            { style: { gap: spacing.xs } },
            React.createElement(
              Text,
              { style: { ...typography.body, fontWeight: "600" } },
              "Accelerometer (m/s²)"
            ),
            React.createElement(
              View,
              { style: { flexDirection: "row", justifyContent: "space-between" } },
              ["X", "Y", "Z"].map((axis, index) => {
                const value = index === 0 ? currentReading.accelerometer.x :
                              index === 1 ? currentReading.accelerometer.y :
                              currentReading.accelerometer.z;
                return React.createElement(
                  View,
                  { key: axis, style: { alignItems: "center" } },
                  React.createElement(
                    Text,
                    { style: typography.caption },
                    axis
                  ),
                  React.createElement(
                    Text,
                    {
                      style: {
                        ...typography.body,
                        fontFamily: "monospace",
                        fontWeight: "600",
                      },
                    },
                    value.toFixed(3)
                  )
                );
              })
            )
          ),
          // Gyroscope
          React.createElement(
            View,
            { style: { gap: spacing.xs } },
            React.createElement(
              Text,
              { style: { ...typography.body, fontWeight: "600" } },
              "Gyroscope (rad/s)"
            ),
            React.createElement(
              View,
              { style: { flexDirection: "row", justifyContent: "space-between" } },
              ["X", "Y", "Z"].map((axis, index) => {
                const value = index === 0 ? currentReading.gyroscope.x :
                              index === 1 ? currentReading.gyroscope.y :
                              currentReading.gyroscope.z;
                return React.createElement(
                  View,
                  { key: axis, style: { alignItems: "center" } },
                  React.createElement(
                    Text,
                    { style: typography.caption },
                    axis
                  ),
                  React.createElement(
                    Text,
                    {
                      style: {
                        ...typography.body,
                        fontFamily: "monospace",
                        fontWeight: "600",
                      },
                    },
                    value.toFixed(3)
                  )
                );
              })
            )
          ),
          // Magnetometer
          React.createElement(
            View,
            { style: { gap: spacing.xs } },
            React.createElement(
              Text,
              { style: { ...typography.body, fontWeight: "600" } },
              "Magnetometer (μT)"
            ),
            React.createElement(
              View,
              { style: { flexDirection: "row", justifyContent: "space-between" } },
              ["X", "Y", "Z"].map((axis, index) => {
                const value = index === 0 ? currentReading.magnetometer.x :
                              index === 1 ? currentReading.magnetometer.y :
                              currentReading.magnetometer.z;
                return React.createElement(
                  View,
                  { key: axis, style: { alignItems: "center" } },
                  React.createElement(
                    Text,
                    { style: typography.caption },
                    axis
                  ),
                  React.createElement(
                    Text,
                    {
                      style: {
                        ...typography.body,
                        fontFamily: "monospace",
                        fontWeight: "600",
                      },
                    },
                    value.toFixed(1)
                  )
                );
              })
            )
          )
        ),

        // Localization Preview Section
        localization && React.createElement(
          View,
          { style: { gap: spacing.md } },
          React.createElement(
            Text,
            { style: typography.h3 },
            "Localization Preview"
          ),
          React.createElement(
            Text,
            {
              style: {
                ...typography.caption,
                fontStyle: "italic",
              },
            },
            "This data will be available in production"
          ),
          React.createElement(
            View,
            {
              style: {
                flexDirection: "row",
                justifyContent: "space-around",
              },
            },
            React.createElement(
              View,
              { style: { alignItems: "center" } },
              React.createElement(
                Text,
                { style: typography.caption },
                "Heading (expo, smoothed)"
              ),
              React.createElement(
                Text,
                {
                  style: {
                    ...typography.h3,
                    fontWeight: "bold",
                  },
                },
                `${localization.heading.toFixed(1)}°`
              )
            ),
            React.createElement(
              View,
              { style: { alignItems: "center" } },
              React.createElement(
                Text,
                { style: typography.caption },
                "Steps"
              ),
              React.createElement(
                Text,
                {
                  style: {
                    ...typography.h3,
                    fontWeight: "bold",
                  },
                },
                localization.stepCount.toString()
              )
            ),
            React.createElement(
              View,
              { style: { alignItems: "center" } },
              React.createElement(
                Text,
                { style: typography.caption },
                "Distance"
              ),
              React.createElement(
                Text,
                {
                  style: {
                    ...typography.h3,
                    fontWeight: "bold",
                  },
                },
                `${localization.distance.toFixed(2)}m`
              )
            )
          ),
          React.createElement(Button, {
            onPress: resetLocalization,
            title: "Reset Localization",
            variant: "secondary",
            style: { marginTop: spacing.sm },
          })
        ),

        // Info Section
        React.createElement(
          View,
          {
            style: {
              gap: spacing.xs,
              marginTop: spacing.md,
              padding: spacing.md,
              backgroundColor: "#F0F4F8",
              borderRadius: 8,
            },
          },
          React.createElement(
            Text,
            { style: { ...typography.body, fontWeight: "600" } },
            "Development Notes"
          ),
          React.createElement(
            Text,
            { style: typography.caption },
            "• Calibrate sensors before collecting data for best accuracy"
          ),
          React.createElement(
            Text,
            { style: typography.caption },
            "• Start logging to collect sensor data for analysis"
          ),
          React.createElement(
            Text,
            { style: typography.caption },
            "• Data is saved to app documents directory"
          ),
          React.createElement(
            Text,
            { style: typography.caption },
            "• Delete this file before production release"
          )
        ),

        // Export Sessions Section
        React.createElement(
          View,
          { style: { gap: spacing.md, marginTop: spacing.md } },
          React.createElement(Button, {
            onPress: loadSessions,
            title: "View & Export Sessions",
            variant: "secondary",
            disabled: isLogging,
          }),
          
          // Sessions List
          showSessions && React.createElement(
            View,
            {
              style: {
                gap: spacing.sm,
                padding: spacing.md,
                backgroundColor: "#F8F9FA",
                borderRadius: 8,
                maxHeight: 300,
              },
            },
            React.createElement(
              Text,
              { style: { ...typography.body, fontWeight: "600" } },
              `Saved Sessions (${sessions.length})`
            ),
            sessions.length === 0 
              ? React.createElement(
                  Text,
                  { style: typography.caption },
                  "No sessions found. Start logging to create one!"
                )
              : sessions.map(session =>
                  React.createElement(
                    View,
                    {
                      key: session,
                      style: {
                        flexDirection: "row",
                        alignItems: "center",
                        gap: spacing.sm,
                        padding: spacing.sm,
                        backgroundColor: "white",
                        borderRadius: 6,
                      },
                    },
                    React.createElement(
                      View,
                      { style: { flex: 1 } },
                      React.createElement(
                        Text,
                        {
                          style: {
                            ...typography.caption,
                            fontFamily: "monospace",
                          },
                        },
                        session.replace('session_', '')
                      )
                    ),
                    React.createElement(
                      View,
                      { style: { flexDirection: "row", gap: spacing.xs } },
                      React.createElement(Button, {
                        onPress: () => handleExportSession(session),
                        title: "Export",
                        variant: "primary",
                        style: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
                      }),
                      React.createElement(Button, {
                        onPress: () => handleDeleteSession(session),
                        title: "Delete",
                        variant: "danger",
                        style: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
                      })
                    )
                  )
                )
          )
        ),

          ),

        subTab === "deadReckoning" &&
          React.createElement(
            React.Fragment,
            null,
            React.createElement(
              View,
              {
                style: {
                  gap: spacing.md,
                  padding: spacing.md,
                  backgroundColor: "#F8F9FA",
                  borderRadius: 8,
                },
              },
              React.createElement(
                Text,
                { style: typography.h3 },
                "Dead-Reckoning Test Mode"
              ),
              React.createElement(
                Text,
                { style: typography.caption },
                "Enter run metadata, pick the floor, select start/end nodes, then start/stop a route run."
              ),
              React.createElement(
                TextInput,
                {
                  value: testRunNumber,
                  onChangeText: setTestRunNumber,
                  placeholder: "Test ID / run number (e.g. 001)",
                  placeholderTextColor: DEAD_RECKONING_PLACEHOLDER_COLOR,
                  editable: !isTestModeRecording,
                  style: deadReckoningInputStyle(!isTestModeRecording),
                }
              ),
              React.createElement(
                Pressable,
                {
                  accessibilityRole: "button",
                  accessibilityLabel: "Select floor",
                  accessibilityHint: "Opens a list of floors for dead reckoning",
                  disabled: isTestModeRecording,
                  onPress: () => setFloorDropdownVisible(true),
                  style: deadReckoningFloorDropdownStyle(isTestModeRecording),
                },
                React.createElement(
                  Text,
                  {
                    style: {
                      ...typography.body,
                      color: colors.text,
                    },
                  },
                  `Floor ${deadReckoningFloor}`
                ),
                React.createElement(Ionicons, {
                  name: "chevron-down",
                  size: 22,
                  color: "#6B7280",
                })
              ),
              React.createElement(
                TextInput,
                {
                  value: testGroundTruthDistanceM,
                  onChangeText: setTestGroundTruthDistanceM,
                  placeholder: "Ground truth distance (m)",
                  placeholderTextColor: DEAD_RECKONING_PLACEHOLDER_COLOR,
                  keyboardType: "decimal-pad",
                  editable: !isTestModeRecording,
                  style: deadReckoningInputStyle(!isTestModeRecording),
                }
              ),
              React.createElement(
                TextInput,
                {
                  value: testerName,
                  onChangeText: setTesterName,
                  placeholder: "Tester",
                  placeholderTextColor: DEAD_RECKONING_PLACEHOLDER_COLOR,
                  editable: !isTestModeRecording,
                  style: deadReckoningInputStyle(!isTestModeRecording),
                }
              ),
              React.createElement(
                TextInput,
                {
                  value: testerDeviceModel,
                  onChangeText: setTesterDeviceModel,
                  placeholder: "Device model",
                  placeholderTextColor: DEAD_RECKONING_PLACEHOLDER_COLOR,
                  editable: !isTestModeRecording,
                  style: deadReckoningInputStyle(!isTestModeRecording),
                }
              ),
              React.createElement(
                Text,
                { style: { ...typography.body, fontWeight: "600", marginTop: spacing.xs } },
                "Route on floor graph (required)"
              ),
              React.createElement(
                Text,
                {
                  style: {
                    ...typography.caption,
                    color: "#555",
                  },
                },
                "Used by plot_runs.py to anchor the path on the BHEE floor graph. Pick start and end nodes for the floor above."
              ),
              React.createElement(
                View,
                { style: { gap: spacing.sm } },
                React.createElement(Button, {
                  onPress: () => {
                    setNodePickerRole("start");
                    setNodePickerVisible(true);
                  },
                  title: overlayStartNodeId ? `Start: ${overlayStartNodeId}` : "Select start node",
                  variant: "secondary",
                  disabled: isTestModeRecording,
                  style: { alignSelf: "stretch" },
                }),
                React.createElement(Button, {
                  onPress: () => {
                    setNodePickerRole("end");
                    setNodePickerVisible(true);
                  },
                  title: overlayEndNodeId ? `End: ${overlayEndNodeId}` : "Select end node",
                  variant: "secondary",
                  disabled: isTestModeRecording,
                  style: { alignSelf: "stretch" },
                })
              ),
              React.createElement(
                View,
                { style: { gap: spacing.sm } },
                React.createElement(Button, {
                  onPress: startTestModeRun,
                  title: "Start Test Run",
                  variant: "primary",
                  disabled: isTestModeRecording,
                  style: { alignSelf: "stretch" },
                }),
                React.createElement(Button, {
                  onPress: stopTestModeRun,
                  title: "Stop Test Run",
                  variant: "danger",
                  disabled: !isTestModeRecording,
                  style: { alignSelf: "stretch" },
                })
              ),
              React.createElement(
                Text,
                { style: typography.caption },
                isTestModeRecording
                  ? `Recording run #${testRunNumber}...`
                  : "Idle"
              ),
              React.createElement(
                View,
                {
                  style: {
                    flexDirection: "row",
                    justifyContent: "space-between",
                  },
                },
                React.createElement(
                  Text,
                  { style: typography.caption },
                  `Elapsed: ${runElapsedSeconds.toFixed(1)}s`
                ),
                React.createElement(
                  Text,
                  { style: typography.caption },
                  `Samples: ${runSampleCount}`
                ),
                React.createElement(
                  Text,
                  { style: typography.caption },
                  `Steps: ${runPedometerSteps}`
                )
              ),
              React.createElement(
                View,
                {
                  style: {
                    flexDirection: "row",
                    justifyContent: "space-between",
                  },
                },
                React.createElement(
                  Text,
                  { style: typography.caption },
                  `Heading raw: ${runHeadingRaw !== null ? runHeadingRaw.toFixed(1) : "--"}°`
                ),
                React.createElement(
                  Text,
                  { style: typography.caption },
                  `Heading avg: ${runHeadingAvg !== null ? runHeadingAvg.toFixed(1) : "--"}°`
                ),
                React.createElement(
                  Text,
                  { style: typography.caption },
                  `Est. dist: ${runEstimatedDistanceM.toFixed(2)}m`
                )
              )
            ),
            React.createElement(
              View,
              {
                style: {
                  gap: spacing.xs,
                  marginTop: spacing.md,
                  padding: spacing.md,
                  backgroundColor: "#F0F4F8",
                  borderRadius: 8,
                },
              },
              React.createElement(
                Text,
                { style: { ...typography.body, fontWeight: "600" } },
                "Dead reckoning notes"
              ),
              React.createElement(
                Text,
                { style: typography.caption },
                "• Samples post to EXPO_PUBLIC_DEAD_RECKONING_LOGGER_URL (or EXPO_PUBLIC_DEV_LOGGER_URL)"
              ),
              React.createElement(
                Text,
                { style: typography.caption },
                "• CSV includes floor + start_node_id + end_node_id for plot_runs.py graph alignment"
              ),
              React.createElement(
                Text,
                { style: typography.caption },
                "• Pedometer must be available on device for step-based distance in test runs"
              )
            )
          )
      )
    ),
    React.createElement(
      Modal,
      {
        visible: floorDropdownVisible,
        transparent: true,
        animationType: "fade",
        onRequestClose: () => setFloorDropdownVisible(false),
      },
      React.createElement(
        View,
        { style: { flex: 1, justifyContent: "center" } },
        React.createElement(Pressable, {
          style: {
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0,0,0,0.45)",
          },
          onPress: () => setFloorDropdownVisible(false),
        }),
        React.createElement(
          View,
          {
            style: {
              marginHorizontal: spacing.lg,
              backgroundColor: "#FFFFFF",
              borderRadius: 10,
              overflow: "hidden",
              borderWidth: 1,
              borderColor: "#E5E7EB",
            },
          },
          ...DEAD_RECKONING_FLOOR_OPTIONS.map((f, index) =>
            React.createElement(
              Pressable,
              {
                key: f,
                onPress: () => {
                  setDeadReckoningFloor(f);
                  setFloorDropdownVisible(false);
                },
                style: {
                  paddingVertical: spacing.md,
                  paddingHorizontal: spacing.lg,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  backgroundColor: deadReckoningFloor === f ? "#EFF6FF" : "#FFFFFF",
                  borderBottomWidth:
                    index < DEAD_RECKONING_FLOOR_OPTIONS.length - 1 ? 1 : 0,
                  borderBottomColor: "#E5E7EB",
                },
              },
              React.createElement(
                Text,
                {
                  style: {
                    ...typography.body,
                    fontWeight: deadReckoningFloor === f ? "700" : "500",
                    color: "#111827",
                  },
                },
                `Floor ${f}`
              ),
              deadReckoningFloor === f
                ? React.createElement(Ionicons, {
                    name: "checkmark",
                    size: 22,
                    color: "#2563EB",
                  })
                : React.createElement(View, { style: { width: 22 } })
            )
          )
        )
      )
    ),
    React.createElement(NodePickerModal, {
      visible: nodePickerVisible,
      title:
        nodePickerRole === "start"
          ? "Start node (floor 2)"
          : nodePickerRole === "end"
            ? "End node (floor 2)"
            : "Select node",
      nodes: FLOOR2_NODES,
      selectedId:
        nodePickerRole === "start"
          ? overlayStartNodeId
          : nodePickerRole === "end"
            ? overlayEndNodeId
            : "",
      onSelect: (id: string) => {
        if (nodePickerRole === "start") {
          setOverlayStartNodeId(id);
        } else if (nodePickerRole === "end") {
          setOverlayEndNodeId(id);
        }
      },
      onClose: () => {
        setNodePickerVisible(false);
        setNodePickerRole(null);
      },
    })
  );
}