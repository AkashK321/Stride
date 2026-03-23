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
  const [isCalibrated, setIsCalibrated] = React.useState(false);
  const [isCalibrating, setIsCalibrating] = React.useState(false);
  const [sessions, setSessions] = React.useState<string[]>([]);
  const [showSessions, setShowSessions] = React.useState(false);
  const [isMonitoring, setIsMonitoring] = React.useState(false);

  React.useEffect(() => {
    // Don't auto-start monitoring - let user control it
    
    // Load existing calibration
    SensorService.loadCalibration().then((loaded) => {
      setIsCalibrated(loaded);
    });

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
      SensorService.stopMonitoring(); // Clean up on unmount
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
  
  const handleCalibrate = async () => {
    Alert.alert(
      "Calibrate Sensors",
      "Place your device on a flat, stable surface in the desired reference orientation. The sensors will be calibrated in 3 seconds.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Start",
          onPress: async () => {
            setIsCalibrating(true);
            
            // Wait 3 seconds for user to position device
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            try {
              await SensorService.calibrate();
              setIsCalibrated(true);
              Alert.alert("Success", "Sensors calibrated successfully!");
            } catch (error) {
              console.error("Calibration error:", error);
              Alert.alert("Error", "Failed to calibrate sensors");
            } finally {
              setIsCalibrating(false);
            }
          },
        },
      ]
    );
  };
  
  const handleClearCalibration = async () => {
    Alert.alert(
      "Clear Calibration",
      "Are you sure you want to clear the calibration data?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: async () => {
            await SensorService.clearCalibration();
            setIsCalibrated(false);
            Alert.alert("Cleared", "Calibration data has been cleared");
          },
        },
      ]
    );
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

        // Calibration Section 
        React.createElement(
          View,
          { 
            style: { 
              gap: spacing.md,
              padding: spacing.md,
              backgroundColor: "#F8F9FA",
              borderRadius: 8,
            } 
          },
          React.createElement(
            Text,
            { style: typography.h3 },
            "Sensor Calibration"
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
                backgroundColor: isCalibrated ? "#4CAF50" : "#FFC107",
              },
            }),
            React.createElement(
              Text,
              { style: typography.body },
              isCalibrated ? "Calibrated ✓" : "Not Calibrated"
            )
          ),
          React.createElement(
            Text,
            { style: typography.caption },
            isCalibrated
              ? "Sensors are calibrated. All readings are relative to your baseline."
              : "Calibrate to set a reference point for accurate measurements."
          ),
          React.createElement(
            View,
            {
              style: {
                flexDirection: "row",
                gap: spacing.sm,
                marginTop: spacing.sm,
              },
            },
            React.createElement(
              View,
              { style: { flex: 1 } },
              React.createElement(Button, {
                onPress: handleCalibrate,
                title: isCalibrating ? "Calibrating..." : "Calibrate Now",
                variant: "primary",
                loading: isCalibrating,
                disabled: isCalibrating || isLogging,
              })
            ),
            isCalibrated && React.createElement(
              View,
              { style: { flex: 1 } },
              React.createElement(Button, {
                onPress: handleClearCalibration,
                title: "Clear",
                variant: "secondary",
                disabled: isCalibrating || isLogging,
              })
            )
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
    )
  );
}