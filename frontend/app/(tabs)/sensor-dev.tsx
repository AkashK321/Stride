/**
 * Sensor Dev screen - development tool for IMU data collection.
 *
 * DEV ONLY - This entire file should be deleted before production release.
 * 
 * This screen provides tools for:
 * - Recording IMU sensor data (accelerometer, gyroscope, magnetometer) to CSV files
 * - Monitoring real-time sensor readings
 * - Previewing localization-style heading (expo-location, same as navigation payloads)
 *
 * Uses React.createElement (non-JSX) to match the project's TypeScript configuration.
 */
import * as React from "react";
import { View, Text, ScrollView, Alert, TextInput } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Pedometer } from "expo-sensors";
import * as Device from "expo-device";
import Button from "../../components/Button";
import NodePickerModal from "../../components/dev/NodePickerModal";
import SensorService from "../../services/SensorService";
import { FLOOR2_NODES } from "../../data/floor2Nodes";
import type { SensorReading, LocalizationData } from "../../services/SensorService";
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
  const [testStartLabel, setTestStartLabel] = React.useState("");
  const [testEndLabel, setTestEndLabel] = React.useState("");
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
    if (!testRunNumber || !testStartLabel || !testEndLabel || !testGroundTruthDistanceM || !testerName || !testerDeviceModel) {
      Alert.alert("Missing metadata", "Please fill in all test-run fields before starting.");
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
      start_label: testStartLabel,
      end_label: testEndLabel,
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
        padding: spacing.lg,
      },
      edges: ["top", "bottom"],
    },
    React.createElement(
      ScrollView,
      {
        style: { flex: 1 },
        showsVerticalScrollIndicator: false,
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
          React.createElement(
            Text,
            {
              style: {
                ...typography.body,
                color: "#FF6B6B",
                fontWeight: "600",
              },
            },
            "Dev Tab for Sensors"
          )
        ),

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

        // Dead-reckoning Test Mode (MVP) Section
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
            "Enter run metadata, then start/stop a route collection run."
          ),
          React.createElement(
            TextInput,
            {
              value: testRunNumber,
              onChangeText: setTestRunNumber,
              placeholder: "Test ID / run number (e.g. 001)",
              editable: !isTestModeRecording,
              style: {
                borderWidth: 1,
                borderColor: "#D1D5DB",
                borderRadius: 8,
                paddingHorizontal: spacing.sm,
                paddingVertical: spacing.sm,
                backgroundColor: "white",
              },
            }
          ),
          React.createElement(
            View,
            { style: { flexDirection: "row", gap: spacing.sm } },
            React.createElement(
              TextInput,
              {
                value: testStartLabel,
                onChangeText: setTestStartLabel,
                placeholder: "Start label",
                editable: !isTestModeRecording,
                style: {
                  flex: 1,
                  borderWidth: 1,
                  borderColor: "#D1D5DB",
                  borderRadius: 8,
                  paddingHorizontal: spacing.sm,
                  paddingVertical: spacing.sm,
                  backgroundColor: "white",
                },
              }
            ),
            React.createElement(
              TextInput,
              {
                value: testEndLabel,
                onChangeText: setTestEndLabel,
                placeholder: "End label",
                editable: !isTestModeRecording,
                style: {
                  flex: 1,
                  borderWidth: 1,
                  borderColor: "#D1D5DB",
                  borderRadius: 8,
                  paddingHorizontal: spacing.sm,
                  paddingVertical: spacing.sm,
                  backgroundColor: "white",
                },
              }
            ),
          ),
          React.createElement(
            View,
            { style: { flexDirection: "row", gap: spacing.sm } },
            React.createElement(
              TextInput,
              {
                value: testGroundTruthDistanceM,
                onChangeText: setTestGroundTruthDistanceM,
                placeholder: "Ground truth distance (m)",
                keyboardType: "decimal-pad",
                editable: !isTestModeRecording,
                style: {
                  flex: 1,
                  borderWidth: 1,
                  borderColor: "#D1D5DB",
                  borderRadius: 8,
                  paddingHorizontal: spacing.sm,
                  paddingVertical: spacing.sm,
                  backgroundColor: "white",
                },
              }
            ),
            React.createElement(
              TextInput,
              {
                value: testerName,
                onChangeText: setTesterName,
                placeholder: "Tester",
                editable: !isTestModeRecording,
                style: {
                  flex: 1,
                  borderWidth: 1,
                  borderColor: "#D1D5DB",
                  borderRadius: 8,
                  paddingHorizontal: spacing.sm,
                  paddingVertical: spacing.sm,
                  backgroundColor: "white",
                },
              }
            ),
          ),
          React.createElement(
            TextInput,
            {
              value: testerDeviceModel,
              onChangeText: setTesterDeviceModel,
              placeholder: "Device model",
              editable: !isTestModeRecording,
              style: {
                borderWidth: 1,
                borderColor: "#D1D5DB",
                borderRadius: 8,
                paddingHorizontal: spacing.sm,
                paddingVertical: spacing.sm,
                backgroundColor: "white",
              },
            }
          ),
          React.createElement(
            Text,
            { style: { ...typography.body, fontWeight: "600", marginTop: spacing.xs } },
            "Floor 2 map overlay (optional)"
          ),
          React.createElement(
            Text,
            {
              style: {
                ...typography.caption,
                color: "#555",
              },
            },
            "Used by plot_runs.py to align the dead-reckoning path on the BHEE floor-2 graph. Pick start/end graph nodes."
          ),
          React.createElement(
            View,
            { style: { flexDirection: "row", gap: spacing.sm } },
            React.createElement(
              View,
              { style: { flex: 1 } },
              React.createElement(Button, {
                onPress: () => {
                  setNodePickerRole("start");
                  setNodePickerVisible(true);
                },
                title: overlayStartNodeId ? `Start: ${overlayStartNodeId}` : "Select start node",
                variant: "secondary",
                disabled: isTestModeRecording,
              })
            ),
            React.createElement(
              View,
              { style: { flex: 1 } },
              React.createElement(Button, {
                onPress: () => {
                  setNodePickerRole("end");
                  setNodePickerVisible(true);
                },
                title: overlayEndNodeId ? `End: ${overlayEndNodeId}` : "Select end node",
                variant: "secondary",
                disabled: isTestModeRecording,
              })
            )
          ),
          React.createElement(
            View,
            { style: { flexDirection: "row", gap: spacing.sm } },
            React.createElement(
              View,
              { style: { flex: 1 } },
              React.createElement(Button, {
                onPress: startTestModeRun,
                title: "Start Test Run",
                variant: "primary",
                disabled: isTestModeRecording,
              })
            ),
            React.createElement(
              View,
              { style: { flex: 1 } },
              React.createElement(Button, {
                onPress: stopTestModeRun,
                title: "Stop Test Run",
                variant: "danger",
                disabled: !isTestModeRecording,
              })
            ),
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

        // Action Button
        React.createElement(
          View,
          { style: { marginTop: spacing.lg } },
          React.createElement(Button, {
            onPress: toggleLogging,
            title: isLogging ? "Stop Logging" : "Start Logging",
            variant: isLogging ? "danger" : "primary",
            loading: false,
            style: { marginTop: spacing.md },
          })
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