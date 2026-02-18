/**
 * Sensor Dev screen - development tool for IMU data collection.
 *
 * DEV ONLY - This entire file should be deleted before production release.
 * 
 * This screen provides tools for:
 * - Recording IMU sensor data (accelerometer, gyroscope, magnetometer) to CSV files
 * - Monitoring real-time sensor readings
 * - Testing localization algorithms before production deployment
 *
 * Uses React.createElement (non-JSX) to match the project's TypeScript configuration.
 */
import * as React from "react";
import { View, Text, ScrollView, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Button from "../../components/Button";
import SensorService from "../../services/SensorService";
import type { SensorReading, LocalizationData } from "../../services/SensorService";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";

export default function SensorDevScreen() {
  const [isLogging, setIsLogging] = React.useState(false);
  const [sessionId, setSessionId] = React.useState<string | null>(null);
  const [sampleCount, setSampleCount] = React.useState(0);
  const [currentReading, setCurrentReading] = React.useState<SensorReading | null>(null);
  const [localization, setLocalization] = React.useState<LocalizationData | null>(null);

  React.useEffect(() => {
    SensorService.startMonitoring();

    const unsubscribeUpdates = SensorService.subscribeToUpdates((reading) => {
      setCurrentReading(reading);
      if (SensorService.isCurrentlyLogging()) {
        setSampleCount(prev => prev + 1);
      }
    });

    const unsubscribeLocalization = SensorService.subscribeToLocalization((data) => {
      setLocalization(data);
    });

    return () => {
      unsubscribeUpdates();
      unsubscribeLocalization();
    };
  }, []);

  const startLogging = async () => {
    try {
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
                backgroundColor: isLogging ? "#4CAF50" : "#9E9E9E",
              },
            }),
            React.createElement(
              Text,
              { style: typography.body },
              isLogging ? "Logging Active" : "Idle"
            )
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
                "10 Hz"
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
                "Heading"
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
    )
  );
}
