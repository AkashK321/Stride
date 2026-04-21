import * as React from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Pressable,
  PanResponder,
  Vibration
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Speech from "expo-speech";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import NavigationInstructionsDropdown from "../../components/NavigationInstructions/NavigationInstructionsDropdown";
import { formatInstruction } from "../../components/NavigationInstructions/NavigationInstructionItem";
import {
  NavigationInstruction,
  startNavigation,
} from "../../services/api";
import {
  CollisionDetectionResponse,
  NavigationFrameMessage,
  NavigationSocketResponse,
  NavigationUpdateResponse,
  NavigationWebSocket,
  getWebSocketUrl,
} from "../../services/navigationWebSocket";
import { colors } from "../../theme/colors";
import { typography } from "../../theme/typography";
import { spacing } from "../../theme/spacing";
import { useHeading } from "../../hooks/useHeading";
import { SensorSnapshot, useSensorData } from "../../hooks/useSensorData";
import { getFocalLengthPixels } from "../../services/focalLength";

/** Collision frame encode settings. */
const COLLISION_FRAME_WIDTH = 256;
const COLLISION_FRAME_COMPRESS = 0.22;
/** How often to tick local progression from pedometer deltas. */
const LOCAL_PROGRESS_TICK_MS = 500;
const SPEECH_MILESTONE_FEET = [50, 10] as const;
const SPEECH_DUPLICATE_WINDOW_MS = 4000;

type StepSpeechState = {
  hasStepAnnouncement: boolean;
  hasArrivalAnnouncement: boolean;
  spokenMilestones: Set<number>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeNavigationInstruction(instruction: unknown): NavigationInstruction | null {
  if (!isRecord(instruction)) return null;
  const coordinates = instruction.coordinates;
  const stepType = instruction.step_type;
  const turnIntent = instruction.turn_intent;

  if (!isRecord(coordinates)) return null;
  if (stepType !== "segment" && stepType !== "arrival") return null;
  if (
    turnIntent !== null &&
    turnIntent !== "left" &&
    turnIntent !== "right" &&
    turnIntent !== "around" &&
    turnIntent !== "straight"
  ) {
    return null;
  }
  if (typeof instruction.step !== "number") return null;
  if (typeof instruction.distance_feet !== "number") return null;
  if (instruction.direction !== null && typeof instruction.direction !== "string") return null;
  if (typeof instruction.start_node_id !== "string") return null;
  if (typeof instruction.end_node_id !== "string") return null;
  if (typeof instruction.node_id !== "string") return null;
  if (typeof coordinates.x !== "number" || typeof coordinates.y !== "number") return null;
  if (instruction.heading_degrees !== null && typeof instruction.heading_degrees !== "number") {
    return null;
  }

  return {
    step: instruction.step,
    step_type: stepType,
    distance_feet: instruction.distance_feet,
    direction: instruction.direction,
    start_node_id: instruction.start_node_id,
    end_node_id: instruction.end_node_id,
    node_id: instruction.node_id,
    coordinates: {
      x: coordinates.x,
      y: coordinates.y,
    },
    heading_degrees: instruction.heading_degrees,
    turn_intent: turnIntent,
  };
}

function normalizeNavigationInstructions(instructions: unknown): NavigationInstruction[] {
  if (!Array.isArray(instructions)) return [];
  return instructions
    .map(normalizeNavigationInstruction)
    .filter((instruction): instruction is NavigationInstruction => instruction !== null);
}

function isNavigationUpdateResponse(
  response: NavigationSocketResponse,
): response is NavigationUpdateResponse {
  return response.type === "navigation_update";
}

function isCollisionDetectionResponse(
  response: NavigationSocketResponse,
): response is CollisionDetectionResponse {
  return "estimatedDistances" in response;
}

function getSingleParam(value: string | string[] | undefined): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (Array.isArray(value) && value.length > 0) {
    const first = value[0];
    if (typeof first === "string") {
      const trimmed = first.trim();
      return trimmed.length > 0 ? trimmed : null;
    }
  }

  return null;
}

export default function NavigationSession() {
  const params = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const cameraRef = React.useRef<CameraView>(null);
  const [navigationInstructions, setNavigationInstructions] =
    React.useState<NavigationInstruction[] | null>(null);
  const [navigationSessionId, setNavigationSessionId] = React.useState<string | null>(null);
  const [navigationError, setNavigationError] = React.useState<string | null>(
    null,
  );
  const [navigationLoading, setNavigationLoading] = React.useState(false);
  const wsRef = React.useRef<NavigationWebSocket | null>(null);
  const collisionLoopRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const localProgressLoopRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const lastVibrationTimeRef = React.useRef(0);
  const lastIntervalRef = React.useRef(0); // 0 = Safe, 1 = Low, 2 = Med, 3 = High
  const collisionFrameInFlightRef = React.useRef(false);
  const requestCounterRef = React.useRef(0);
  const [speakerMode, setSpeakerMode] = React.useState(false);
  const [showDebugBackground, setShowDebugBackground] = React.useState(false);
  const [currentStepIndex, setCurrentStepIndex] = React.useState(0);
  const [distanceConsumedFeet, setDistanceConsumedFeet] = React.useState(0);
  const [latestProgressDeltaFeet, setLatestProgressDeltaFeet] = React.useState(0);
  const [lastProgressTickMs, setLastProgressTickMs] = React.useState<number | null>(null);
  const [lastSensorSnapshot, setLastSensorSnapshot] = React.useState<SensorSnapshot | null>(null);
  const [wsStatus, setWsStatus] = React.useState<"disconnected" | "connecting" | "connected" | "error">("disconnected");
  const [collisionFramesSent, setCollisionFramesSent] = React.useState(0);
  const [collisionFramesDropped, setCollisionFramesDropped] = React.useState(0);
  const [lastCollisionSendAtMs, setLastCollisionSendAtMs] = React.useState<number | null>(null);
  const fallbackFocalLengthPixels = React.useMemo(
    () => getFocalLengthPixels(COLLISION_FRAME_WIDTH),
    [],
  );
  const {
    getSnapshot,
    getProgressSnapshot,
    start: startSensors,
    stop: stopSensors,
  } = useSensorData();

  const { getAlignment } = useHeading();
  const activeInstruction = navigationInstructions?.[currentStepIndex] ?? null;
  const alignment = getAlignment(activeInstruction?.heading_degrees ?? null);

  const toggleSpeakerMode = React.useCallback(() => {
    setSpeakerMode((prev) => !prev);
  }, []);
  const toggleDebugBackground = React.useCallback(() => {
    setShowDebugBackground((prev) => !prev);
  }, []);

  const handleSelectedIndexChange = React.useCallback((index: number) => {
    currentStepIndexRef.current = index;
    setCurrentStepIndex(index);
  }, []);

  const stopStreamingLoops = React.useCallback(() => {
    if (collisionLoopRef.current) {
      clearInterval(collisionLoopRef.current);
      collisionLoopRef.current = null;
    }
    if (localProgressLoopRef.current) {
      clearInterval(localProgressLoopRef.current);
      localProgressLoopRef.current = null;
    }
  }, []);

  const nextRequestId = React.useCallback(() => {
    requestCounterRef.current += 1;
    return requestCounterRef.current;
  }, []);

  const captureBase64Frame = React.useCallback(async (
    options?: { width?: number; compress?: number },
  ): Promise<string | null> => {
    if (!cameraRef.current) {
      return null;
    }
    const photo = await cameraRef.current.takePictureAsync({
      quality: 0.5,
      base64: false,
      skipProcessing: true,
      shutterSound: false,
    });
    if (!photo?.uri) return null;

    const encodeOptions = {
      base64: true,
      compress: options?.compress ?? COLLISION_FRAME_COMPRESS,
      format: SaveFormat.JPEG as const,
    };

    try {
      // By supplying only width, Expo automatically scales the height to preserve the full frame's aspect ratio.
      const resized = await manipulateAsync(
        photo.uri,
        [{ resize: { width: options?.width ?? COLLISION_FRAME_WIDTH } }],
        encodeOptions,
      );
      return resized.base64 ?? null;
    } catch (e) {
      console.error("Frame manipulation failed:", e);
      return null;
    }
  }, []);

  const sendCollisionFrame = React.useCallback(async () => {
    const ws = wsRef.current;
    if (!ws || !ws.isConnected() || !navigationSessionId || collisionFrameInFlightRef.current) {
      return;
    }
    collisionFrameInFlightRef.current = true;
    try {
      const imageBase64 = await captureBase64Frame({
        width: COLLISION_FRAME_WIDTH,
        compress: COLLISION_FRAME_COMPRESS,
      });
      if (!imageBase64) return;
      const snapshot = getSnapshot({ consumeDistance: false });
      setLastSensorSnapshot(snapshot);
      const message: NavigationFrameMessage = {
        action: "frame",
        session_id: navigationSessionId,
        image_base64: imageBase64,
        focal_length_pixels: fallbackFocalLengthPixels,
        heading_degrees: snapshot.heading,
        distance_traveled: 0,
        gps: snapshot.gps,
        timestamp_ms: Date.now(),
        request_id: nextRequestId(),
      };
      const didSend = ws.sendFrame(message);
      if (didSend) {
        setCollisionFramesSent((prev) => prev + 1);
        setLastCollisionSendAtMs(Date.now());
      } else {
        setCollisionFramesDropped((prev) => prev + 1);
      }
    } catch (e) {
      setNavigationError(e instanceof Error ? e.message : "Failed to send collision frame");
    } finally {
      collisionFrameInFlightRef.current = false;
    }
  }, [
    captureBase64Frame,
    fallbackFocalLengthPixels,
    getSnapshot,
    navigationSessionId,
    nextRequestId,
  ]);

  const handleSocketMessage = React.useCallback((response: NavigationSocketResponse) => {
    if (isNavigationUpdateResponse(response)) {
      // Static navigation mode: ignore backend instruction updates.
      setNavigationError(null);
      return;
    }

    if (response.type === "navigation_error") {
      setNavigationError(response.error || response.message || "Live navigation update failed");
      return;
    }

    if (
      isCollisionDetectionResponse(response) &&
      Array.isArray(response.estimatedDistances) &&
      response.estimatedDistances.length > 0
    ) {
      
      console.log("Received collision update with distances (meters):", response.estimatedDistances);
      // The backend returns distances in meters, convert to feet and find the closest object
      const distancesInMeters = response.estimatedDistances.map((entry) => parseFloat(entry.distance));
      const minDistanceMeters = Math.min(...distancesInMeters);

      const minDistanceFeet = minDistanceMeters * 3.28084;

      let currentInterval = 0; 
      if (minDistanceFeet < 5) currentInterval = 3;
      else if (minDistanceFeet < 10) currentInterval = 2;
      else if (minDistanceFeet <= 20) currentInterval = 1;

      const now = Date.now();
      const timeSinceLast = now - lastVibrationTimeRef.current;
      
      console.log(`Closest object at ${minDistanceFeet.toFixed(1)} ft, interval ${currentInterval}, time since last vibration ${timeSinceLast} ms`);
      if (currentInterval > 0) {
        // TRIGGER RULE:
        // 1. If danger escalated (e.g. Low -> High), vibrate immediately to warn the user.
        // 2. If danger is the same/lower, wait for the previous pattern to fully finish (500ms frame cycle).
        if (currentInterval > lastIntervalRef.current || timeSinceLast >= 500) {
          
          if (currentInterval === 3) {
            // [0-5) ft: High danger - 3 rapid buzzes
            // Duration: 100+40+100+40+100 = 380ms (Leaves 120ms of silence before next frame)
            Vibration.vibrate([0, 100, 40, 100, 40, 100]);
          } else if (currentInterval === 2) {
            // [5-10) ft: Medium warning - 2 moderate buzzes
            // Duration: 150+100+150 = 400ms (Leaves 100ms of silence before next frame)
            Vibration.vibrate([0, 150, 100, 150]);
          } else if (currentInterval === 1) {
            // [10-20] ft: Low alert - 1 long pulse
            // Duration: 400ms (Leaves 100ms of silence before next frame)
            Vibration.vibrate(400);
          }

          lastVibrationTimeRef.current = now;
          lastIntervalRef.current = currentInterval;
        }
      } else {
        lastIntervalRef.current = 0; // Reset to safe
      }
    } else {
      lastIntervalRef.current = 0; // Reset if no objects detected in frame
    }
  }, []);

  /** Always latest send fns so WebSocket intervals do not need effect re-runs when sensors/state change. */
  const sendCollisionFrameRef = React.useRef(sendCollisionFrame);
  sendCollisionFrameRef.current = sendCollisionFrame;

  const handleSocketMessageRef = React.useRef(handleSocketMessage);
  handleSocketMessageRef.current = handleSocketMessage;

  const startSensorsRef = React.useRef(startSensors);
  const stopSensorsRef = React.useRef(stopSensors);
  startSensorsRef.current = startSensors;
  stopSensorsRef.current = stopSensors;

  const instructionCountRef = React.useRef(0);
  instructionCountRef.current = navigationInstructions?.length ?? 0;
  const currentStepIndexRef = React.useRef(currentStepIndex);
  currentStepIndexRef.current = currentStepIndex;
  const stepSpeechStateRef = React.useRef(new Map<number, StepSpeechState>());
  const previousStepForSpeechRef = React.useRef<number | null>(null);
  const previousRemainingFeetRef = React.useRef<number | null>(null);
  const lastSpeechMetaRef = React.useRef<{
    message: string;
    spokenAtMs: number;
    priority: number;
  } | null>(null);

  const getStepSpeechState = React.useCallback((stepIndex: number): StepSpeechState => {
    const existing = stepSpeechStateRef.current.get(stepIndex);
    if (existing) {
      return existing;
    }
    const created: StepSpeechState = {
      hasStepAnnouncement: false,
      hasArrivalAnnouncement: false,
      spokenMilestones: new Set<number>(),
    };
    stepSpeechStateRef.current.set(stepIndex, created);
    return created;
  }, []);

  const speakWithGuards = React.useCallback(
    async (
      message: string,
      priority: number,
      options?: { duplicateWindowMs?: number },
    ): Promise<void> => {
      if (!speakerMode) return;

      const duplicateWindowMs = options?.duplicateWindowMs ?? SPEECH_DUPLICATE_WINDOW_MS;
      const now = Date.now();
      const lastSpeech = lastSpeechMetaRef.current;
      if (
        lastSpeech &&
        lastSpeech.message === message &&
        now - lastSpeech.spokenAtMs < duplicateWindowMs
      ) {
        return;
      }

      let isSpeaking = false;
      try {
        isSpeaking = await Speech.isSpeakingAsync();
      } catch {
        isSpeaking = false;
      }

      if (isSpeaking) {
        const lastPriority = lastSpeech?.priority ?? -1;
        if (priority <= lastPriority) {
          return;
        }
        Speech.stop();
      }

      Speech.speak(message, { language: "en" });
      lastSpeechMetaRef.current = {
        message,
        spokenAtMs: now,
        priority,
      };
    },
    [speakerMode],
  );

  const panResponder = React.useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        const { dx } = gestureState;
        return Math.abs(dx) > 25;
      },
      onPanResponderRelease: (_, gestureState) => {
        const { dx } = gestureState;
        const SWIPE_THRESHOLD = 50;
        const count = instructionCountRef.current;
        if (count <= 0) return;
        setCurrentStepIndex((prev) => {
          if (dx > SWIPE_THRESHOLD) {
            return Math.max(0, prev - 1);
          }
          if (dx < -SWIPE_THRESHOLD) {
            return Math.min(count - 1, prev + 1);
          }
          return prev;
        });
      },
    }),
  ).current;

  // Speak instruction with per-step milestones instead of every incremental update.
  React.useEffect(() => {
    if (!speakerMode || !navigationInstructions || navigationInstructions.length === 0 || !activeInstruction) {
      return;
    }

    const safeIndex = Math.max(0, Math.min(currentStepIndex, navigationInstructions.length - 1));
    const current = navigationInstructions[safeIndex];
    const stepSpeechState = getStepSpeechState(safeIndex);
    const previousStepIndex = previousStepForSpeechRef.current;
    const isNewStep = previousStepIndex !== safeIndex;
    const currentRemainingFeet =
      typeof current.distance_feet === "number" && Number.isFinite(current.distance_feet)
        ? Math.max(current.distance_feet, 0)
        : null;

    if (isNewStep) {
      previousStepForSpeechRef.current = safeIndex;
      previousRemainingFeetRef.current = currentRemainingFeet;
      if (current.step_type === "arrival") {
        if (!stepSpeechState.hasArrivalAnnouncement) {
          stepSpeechState.hasArrivalAnnouncement = true;
          void speakWithGuards(formatInstruction(current), 100, { duplicateWindowMs: 0 });
        }
      } else if (!stepSpeechState.hasStepAnnouncement) {
        stepSpeechState.hasStepAnnouncement = true;
        void speakWithGuards(formatInstruction(current), 85, { duplicateWindowMs: 0 });
      }
      return;
    }

    const previousRemainingFeet = previousRemainingFeetRef.current;
    previousRemainingFeetRef.current = currentRemainingFeet;

    if (current.step_type === "arrival") {
      if (!stepSpeechState.hasArrivalAnnouncement) {
        stepSpeechState.hasArrivalAnnouncement = true;
        void speakWithGuards(formatInstruction(current), 100);
      }
      return;
    }

    if (previousRemainingFeet === null || currentRemainingFeet === null) {
      return;
    }

    for (const milestoneFeet of SPEECH_MILESTONE_FEET) {
      if (stepSpeechState.spokenMilestones.has(milestoneFeet)) {
        continue;
      }
      if (previousRemainingFeet > milestoneFeet && currentRemainingFeet <= milestoneFeet) {
        stepSpeechState.spokenMilestones.add(milestoneFeet);
        const message = `${milestoneFeet} feet remaining. ${formatInstruction(current)}`;
        const priority = milestoneFeet <= 10 ? 95 : 70;
        void speakWithGuards(message, priority);
        break;
      }
    }
  }, [
    activeInstruction,
    currentStepIndex,
    getStepSpeechState,
    navigationInstructions,
    speakerMode,
    speakWithGuards,
  ]);

  React.useEffect(() => {
    if (!speakerMode) {
      Speech.stop();
      stepSpeechStateRef.current.clear();
      previousStepForSpeechRef.current = null;
      previousRemainingFeetRef.current = null;
      lastSpeechMetaRef.current = null;
    }
  }, [speakerMode]);

  // Kick off navigation when the screen mounts
  React.useEffect(() => {
    const landmarkId = getSingleParam(params.landmark_id);
    if (!landmarkId) {
      setNavigationError("No destination provided.");
      return;
    }
    const startNodeId = getSingleParam(params.start_node_id);
    if (!startNodeId) {
      setNavigationError("No start location provided.");
      return;
    }

    let cancelled = false;

    const run = async () => {
      setNavigationLoading(true);
      setNavigationError(null);
      try {
        const response = await startNavigation({
          destination: { landmark_id: landmarkId },
          start_location: { node_id: startNodeId },
        });
        if (cancelled) return;
        const normalizedInstructions = normalizeNavigationInstructions(response.instructions);
        if (normalizedInstructions.length === 0) {
          throw new Error("Navigation response contained no valid instructions");
        }
        setNavigationSessionId(response.session_id);
        setCurrentStepIndex(0);
        currentStepIndexRef.current = 0;
        setDistanceConsumedFeet(0);
        setLatestProgressDeltaFeet(0);
        setLastProgressTickMs(null);
        setLastSensorSnapshot(null);
        setCollisionFramesSent(0);
        setCollisionFramesDropped(0);
        setLastCollisionSendAtMs(null);
        setNavigationInstructions(normalizedInstructions);
      } catch (err) {
        if (cancelled) return;
        setNavigationInstructions(null);
        setNavigationError(
          err instanceof Error ? err.message : "Failed to start navigation",
        );
      } finally {
        if (!cancelled) {
          setNavigationLoading(false);
        }
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [params.landmark_id, params.start_node_id]);

  // WebSocket + loops: run only when session id appears or changes — not when send callbacks
  // or sensorsActive change (that was causing disconnect/reconnect churn).
  React.useEffect(() => {
    if (!navigationSessionId) {
      return;
    }

    let cancelled = false;

    const run = async () => {
      try {
        const wsUrl = getWebSocketUrl();
        if (!wsUrl) {
          setNavigationError("WebSocket URL is not configured");
          return;
        }
        const ws = new NavigationWebSocket(wsUrl);
        ws.autoReconnect = true;
        ws.setStatusHandler((status) => {
          setWsStatus(status);
          if (status === "error") {
            setNavigationError("WebSocket connection error");
          }
        });
        ws.setMessageHandler((response) => {
          handleSocketMessageRef.current(response);
        });
        wsRef.current = ws;
        await ws.connect();
        if (cancelled) return;

        await startSensorsRef.current();
        if (cancelled) return;

        collisionLoopRef.current = setInterval(() => {
          void sendCollisionFrameRef.current();
        }, 500);

        void sendCollisionFrameRef.current();
      } catch (e) {
        if (!cancelled) {
          setNavigationError(
            e instanceof Error ? e.message : "Failed to initialize live streaming",
          );
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
      stopStreamingLoops();
      wsRef.current?.disconnect();
      wsRef.current = null;
      stopSensorsRef.current();
    };
  }, [navigationSessionId, stopStreamingLoops]);

  React.useEffect(() => {
    if (!navigationSessionId) {
      return;
    }
    localProgressLoopRef.current = setInterval(() => {
      if (instructionCountRef.current === 0) return;
      const snapshot = getProgressSnapshot();
      setLastSensorSnapshot(snapshot);
      setLatestProgressDeltaFeet(snapshot.distanceDeltaFeet);
      setLastProgressTickMs(Date.now());
      if (snapshot.distanceDeltaFeet <= 0) return;
      setDistanceConsumedFeet((prev) => prev + snapshot.distanceDeltaFeet);
      setNavigationInstructions((prev) => {
        if (!prev || prev.length === 0) return prev;
        const updated = prev.map((instruction) => ({ ...instruction }));
        let step = currentStepIndexRef.current;
        let remainingDelta = snapshot.distanceDeltaFeet;
        while (remainingDelta > 0 && step < updated.length) {
          const current = updated[step];
          if (current.step_type === "arrival") break;
          if (current.distance_feet > remainingDelta) {
            current.distance_feet -= remainingDelta;
            remainingDelta = 0;
            break;
          }
          remainingDelta -= Math.max(current.distance_feet, 0);
          current.distance_feet = 0;
          if (step < updated.length - 1) {
            step += 1;
          } else {
            break;
          }
        }
        if (step !== currentStepIndexRef.current) {
          currentStepIndexRef.current = step;
          setCurrentStepIndex(step);
        }
        return updated;
      });
    }, LOCAL_PROGRESS_TICK_MS);

    return () => {
      if (localProgressLoopRef.current) {
        clearInterval(localProgressLoopRef.current);
        localProgressLoopRef.current = null;
      }
    };
  }, [getProgressSnapshot, navigationSessionId]);

  const handleExitNavigation = React.useCallback(() => {
    stopStreamingLoops();
    wsRef.current?.disconnect();
    wsRef.current = null;
    stopSensors();
    router.back();
  }, [stopSensors, stopStreamingLoops]);

  const totalDistanceFeet = React.useMemo(() => {
    if (!navigationInstructions || navigationInstructions.length === 0) {
      return null;
    }
    const rawTotal = navigationInstructions.reduce(
      (sum, inst) => sum + inst.distance_feet,
      0,
    );
    return Math.round(rawTotal / 5) * 5;
  }, [navigationInstructions]);
  const roundedConsumedFeet = Math.round(distanceConsumedFeet * 10) / 10;
  const roundedLatestDeltaFeet = Math.round(latestProgressDeltaFeet * 100) / 100;
  const roundedRemainingFeet = activeInstruction
    ? Math.round(Math.max(activeInstruction.distance_feet, 0) * 10) / 10
    : null;
  const headingLabel =
    lastSensorSnapshot?.heading === null || lastSensorSnapshot?.heading === undefined
      ? "n/a"
      : `${Math.round(lastSensorSnapshot.heading)}°`;
  const speedLabel = lastSensorSnapshot
    ? `${(lastSensorSnapshot.effectiveSpeedStepsPerMs * 1000).toFixed(2)} steps/s`
    : "n/a";
  const progressTickLabel = lastProgressTickMs
    ? `${Math.round((Date.now() - lastProgressTickMs) / 100) / 10}s ago`
    : "n/a";

  if (!cameraPermission) {
    return React.createElement(
      View,
      { style: styles.centered },
      React.createElement(ActivityIndicator, {
        size: "large",
        color: colors.primary,
      }),
    );
  }

  if (!cameraPermission.granted) {
    return React.createElement(
      GestureHandlerRootView,
      { style: styles.root },
      React.createElement(
        View,
        { style: styles.centered },
        React.createElement(
          Text,
          { style: styles.permissionText },
          "Camera permission is required to use navigation.",
        ),
        React.createElement(
          Text,
          {
            style: styles.permissionLink,
            onPress: requestCameraPermission,
          },
          "Grant Camera Permission",
        ),
      ),
    );
  }

  return React.createElement(
    GestureHandlerRootView,
    { style: styles.root },

    React.createElement(CameraView, {
      ref: cameraRef,
      style: styles.cameraBackground,
      facing: "back",
    }),

    React.createElement(
      SafeAreaView,
      {
        style: styles.overlay,
        edges: ["top"] as const,
      },
      React.createElement(
        View,
        {
          style: [styles.swipeableOverlay, styles.swipeableOverlayCamera],
          ...(navigationInstructions && navigationInstructions.length > 0
            ? panResponder.panHandlers
            : {}),
        },
        navigationLoading &&
          React.createElement(
            View,
            { style: styles.loadingBanner },
            React.createElement(ActivityIndicator, {
              size: "small",
              color: colors.buttonPrimaryText,
            }),
            React.createElement(
              Text,
              { style: styles.loadingText },
              "Calculating route…",
            ),
          ),

        navigationError &&
          React.createElement(
            View,
            { style: styles.errorBanner },
            React.createElement(
              Text,
              { style: styles.errorText },
              navigationError,
            ),
          ),

        navigationInstructions &&
          React.createElement(NavigationInstructionsDropdown, {
            instructions: navigationInstructions,
            onExit: handleExitNavigation,
            selectedIndex: currentStepIndex,
            onSelectedIndexChange: handleSelectedIndexChange,
          }),
        showDebugBackground &&
          React.createElement(
            View,
            { style: styles.debugPanel },
            React.createElement(
              Text,
              { style: styles.debugTitle },
              "Navigation Debug",
            ),
            React.createElement(
              Text,
              { style: styles.debugLine },
              `WS: ${wsStatus} | collision sent: ${collisionFramesSent} | dropped: ${collisionFramesDropped}`,
            ),
            React.createElement(
              Text,
              { style: styles.debugLine },
              `Heading: ${headingLabel} | alignment: ${alignment}`,
            ),
            React.createElement(
              Text,
              { style: styles.debugLine },
              `Step ${navigationInstructions ? currentStepIndex + 1 : "n/a"}/${navigationInstructions?.length ?? "n/a"} | remaining: ${roundedRemainingFeet ?? "n/a"} ft`,
            ),
            activeInstruction &&
              React.createElement(
                Text,
                { style: styles.debugLine },
                `Instruction: ${formatInstruction(activeInstruction)}`,
              ),
            React.createElement(
              Text,
              { style: styles.debugLine },
              `Progress consumed: ${roundedConsumedFeet} ft | latest tick: +${roundedLatestDeltaFeet} ft (${progressTickLabel})`,
            ),
            React.createElement(
              Text,
              { style: styles.debugLine },
              `Pedometer steps: ${lastSensorSnapshot?.lastPedometerSteps ?? "n/a"} | speed: ${speedLabel}`,
            ),
            React.createElement(
              Text,
              { style: styles.debugLine },
              `Interpolation: ${lastSensorSnapshot?.interpolationApplied ? "on" : "off"} | age: ${lastSensorSnapshot?.timeSincePedoMs ?? "n/a"} ms | last collision send: ${lastCollisionSendAtMs ? `${Math.round((Date.now() - lastCollisionSendAtMs) / 100) / 10}s ago` : "n/a"}`,
            ),
          ),
      ),
    ),

    params.name &&
      navigationInstructions &&
      React.createElement(
        View,
        { style: styles.bottomNavContainer },
        React.createElement(
          View,
          { style: styles.speakerButtonRow },
          React.createElement(
            Pressable,
            {
              style: [
                styles.debugToggleButton,
                showDebugBackground ? styles.debugToggleButtonActive : null,
              ],
              onPress: toggleDebugBackground,
              accessibilityRole: "button",
              accessibilityLabel: showDebugBackground
                ? "Hide debug background"
                : "Show debug background",
            },
            React.createElement(Ionicons, {
              name: "bug-outline",
              size: 22,
              color: showDebugBackground ? colors.primary : colors.textSecondary,
            }),
          ),
          React.createElement(
            Pressable,
            {
              style: styles.speakerButton,
              onPress: toggleSpeakerMode,
              accessibilityRole: "button",
              accessibilityLabel: speakerMode ? "Speaker on, tap to turn off" : "Speaker off, tap to turn on",
            },
            React.createElement(Ionicons, {
              name: speakerMode ? "volume-high" : "volume-mute-outline",
              size: 28,
              color: speakerMode ? colors.primary : colors.textSecondary,
            }),
          ),
        ),
        React.createElement(
          View,
          {
            style: [
              styles.bottomNavBar,
              { paddingBottom: insets.bottom || spacing.sm },
            ],
          },
          React.createElement(
            View,
            { style: styles.bottomNavTextContainer },
            React.createElement(
              Text,
              { style: styles.bottomNavDestination, numberOfLines: 1 },
              params.name,
            ),
            totalDistanceFeet !== null &&
              React.createElement(
                Text,
                { style: styles.bottomNavDistance },
                `${totalDistanceFeet} ft`,
              ),
            // Alignment indicator — shows when heading_degrees is available on the active instruction.
            // Hidden on the final "arrive" step (heading_degrees is null) and before instructions load.
            alignment !== "unknown" &&
              React.createElement(
                View,
                { style: styles.alignmentRow },
                React.createElement(Ionicons, {
                  name:
                    alignment === "aligned"
                      ? "checkmark-circle"
                      : alignment === "turn_left"
                      ? "arrow-back-circle"
                      : "arrow-forward-circle",
                  size: 20,
                  color: alignment === "aligned" ? colors.primary : colors.textSecondary,
                }),
                React.createElement(
                  Text,
                  { style: styles.alignmentText },
                  alignment === "aligned"
                    ? "Facing the right way"
                    : alignment === "turn_left"
                    ? "Turn left"
                    : "Turn right",
                ),
              ),
          ),
          React.createElement(
            Pressable,
            {
              style: styles.bottomNavEndButton,
              onPress: handleExitNavigation,
              accessibilityRole: "button",
              accessibilityLabel: "End navigation",
            },
            React.createElement(
              Text,
              { style: styles.bottomNavEndButtonText },
              "End navigation",
            ),
          ),
        ),
      ),
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  hiddenCamera: {
    position: "absolute",
    width: 1,
    height: 1,
    opacity: 0,
  },
  cameraBackground: {
    ...StyleSheet.absoluteFillObject,
  },
  overlay: {
    flex: 1,
  },
  swipeableOverlay: {
    flex: 1,
  },
  swipeableOverlayCamera: {
    backgroundColor: "transparent",
  },
  debugToggleButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.background,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.backgroundSecondary,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  debugToggleButtonActive: {
    borderColor: colors.primary,
    borderWidth: 1,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.xl,
    backgroundColor: colors.background,
  },
  permissionText: {
    ...typography.body,
    textAlign: "center",
    marginBottom: spacing.md,
    color: colors.text,
  },
  permissionLink: {
    ...typography.body,
    color: colors.primary,
    fontWeight: "700",
  },
  loadingBanner: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.secondary,
  },
  loadingText: {
    ...typography.label,
    color: colors.buttonPrimaryText,
    marginLeft: spacing.sm,
  },
  errorBanner: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: "#FEF2F2",
  },
  errorText: {
    ...typography.label,
    color: colors.danger,
  },
  debugPanel: {
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 14,
    backgroundColor: "#FFFFFFEE",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.secondary,
    gap: 4,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  debugTitle: {
    ...typography.h3,
    fontSize: 18,
    color: colors.text,
    marginBottom: 2,
  },
  debugLine: {
    ...typography.label,
    color: colors.textSecondary,
  },
  bottomNavContainer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    width: "100%",
  },
  speakerButtonRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  speakerButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.background,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.backgroundSecondary,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  bottomNavBar: {
    flexDirection: "column",
    alignItems: "stretch",
    alignSelf: "stretch",
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    backgroundColor: colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: "hidden",
  },
  bottomNavTextContainer: {
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  bottomNavDestination: {
    ...typography.h3,
    fontSize: 22,
    color: colors.text,
  },
  bottomNavDistance: {
    ...typography.label,
    marginTop: 4,
    fontSize: 18,
    color: colors.textSecondary,
  },
  alignmentRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 6,
    gap: 6,
  },
  alignmentText: {
    ...typography.label,
    fontSize: 15,
    color: colors.textSecondary,
  },
  bottomNavEndButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: 16,
    alignItems: "center",
    alignSelf: "stretch",
    backgroundColor: colors.danger,
  },
  bottomNavEndButtonText: {
    ...typography.button,
    fontSize: 16,
    color: colors.buttonPrimaryText,
  },
});