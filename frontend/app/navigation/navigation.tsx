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
import { Ionicons, Feather } from "@expo/vector-icons";
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
import { useOrientationFeedback } from "../../hooks/useOrientationFeedback";
import { SensorSnapshot, useSensorData } from "../../hooks/useSensorData";
import { getFocalLengthPixels } from "../../services/focalLength";
import { useSettings } from "@/contexts/SettingsContext";

/** Collision frame encode settings. */
const COLLISION_FRAME_WIDTH = 256;
const COLLISION_FRAME_COMPRESS = 0.22;
/** How often to tick local progression from pedometer deltas. */
const LOCAL_PROGRESS_TICK_MS = 1000;
const COLLISION_SCHEDULER_TICK_MS = 250;
const COLLISION_IDLE_MIN_INTERVAL_MS = 650;
const COLLISION_WALKING_MIN_INTERVAL_MS = 900;
const COLLISION_PROGRESS_PRIORITY_WINDOW_MS = 140;
const COLLISION_RECENT_PEDOMETER_MS = 1200;
const COLLISION_OVERLOAD_MS = 550;
const COLLISION_OVERLOAD_BACKOFF_MS = 350;
const COLLISION_START_STAGGER_MS = 175;
const DEBUG_SENSOR_POLL_MS = 200;
const SPEECH_MILESTONE_FEET = [50, 10] as const;
const SPEECH_DUPLICATE_WINDOW_MS = 4000;
const ORIENTATION_ALIGN_HOLD_MS = 1500;
const ORIENTATION_PROGRESS_TICK_MS = 50;
const ORIENTATION_RING_SEGMENTS = 56;
const ORIENTATION_PROMPT_TEXT = "Orient yourself to begin navigation.";

type CollisionRiskLevel = "safe" | "low" | "medium" | "high";

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

function normalizeHeadingDegrees(value: number): number {
  const normalized = value % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

export default function NavigationSession() {
  const params = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const { cameraMode } = useSettings();
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
  const collisionStartTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const localProgressLoopRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const lastProgressRunAtMsRef = React.useRef(0);
  const lastCollisionCaptureAtMsRef = React.useRef(0);
  const collisionBackoffUntilMsRef = React.useRef(0);
  const lastVibrationTimeRef = React.useRef(0);
  const lastIntervalRef = React.useRef(0); // 0 = Safe, 1 = Low, 2 = Med, 3 = High
  const collisionFrameInFlightRef = React.useRef(false);
  const requestCounterRef = React.useRef(0);
  const [speakerMode, setSpeakerMode] = React.useState(true);
  const [showDebugBackground, setShowDebugBackground] = React.useState(false);
  const [navigationMode, setNavigationMode] = React.useState<"orienting" | "navigating">(
    "navigating",
  );
  const [orientationIntroComplete, setOrientationIntroComplete] = React.useState(false);
  const [orientationHoldProgress, setOrientationHoldProgress] = React.useState(0);
  const [currentStepIndex, setCurrentStepIndex] = React.useState(0);
  const [distanceConsumedFeet, setDistanceConsumedFeet] = React.useState(0);
  const [latestProgressDeltaFeet, setLatestProgressDeltaFeet] = React.useState(0);
  const [lastProgressTickMs, setLastProgressTickMs] = React.useState<number | null>(null);
  const [lastSensorSnapshot, setLastSensorSnapshot] = React.useState<SensorSnapshot | null>(null);
  const [wsStatus, setWsStatus] = React.useState<"disconnected" | "connecting" | "connected" | "error">("disconnected");
  const [collisionFramesSent, setCollisionFramesSent] = React.useState(0);
  const [collisionFramesDropped, setCollisionFramesDropped] = React.useState(0);
  const [lastCollisionSendAtMs, setLastCollisionSendAtMs] = React.useState<number | null>(null);
  const [collisionRiskLevel, setCollisionRiskLevel] = React.useState<CollisionRiskLevel>("safe");
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

  const { smoothedHeading, getAlignment, getHeadingDelta } = useHeading();
  const {
    start: startOrientationFeedback,
    stop: stopOrientationFeedback,
    update: updateOrientationFeedback,
    playAlignedCompletionDing,
  } = useOrientationFeedback();
  const activeInstruction = navigationInstructions?.[currentStepIndex] ?? null;
  const activeInstructionHeading = activeInstruction?.heading_degrees ?? null;
  const alignment = getAlignment(activeInstructionHeading);
  const isAlignedWithInstructionHeading = alignment === "aligned";
  const roundedHeading =
    smoothedHeading == null ? null : ((Math.round(smoothedHeading) % 360) + 360) % 360;
  const orientationTargetHeading = navigationInstructions?.[0]?.heading_degrees ?? null;
  const orientationAlignment = getAlignment(orientationTargetHeading);
  const orientationHeadingDelta = getHeadingDelta(orientationTargetHeading);
  const orientationAbsErrorDeg =
    orientationHeadingDelta === null ? 180 : Math.abs(orientationHeadingDelta);
  const orientationInstructionText = ORIENTATION_PROMPT_TEXT;
  const orientationCurrentHeading =
    smoothedHeading == null ? null : Math.round(normalizeHeadingDegrees(smoothedHeading));
  const orientationTargetHeadingRounded =
    orientationTargetHeading == null
      ? null
      : Math.round(normalizeHeadingDegrees(orientationTargetHeading));
  const orientationProgressSegmentsLit = Math.round(
    orientationHoldProgress * ORIENTATION_RING_SEGMENTS,
  );
  const isOrienting = navigationMode === "orienting";

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
    if (collisionStartTimeoutRef.current) {
      clearTimeout(collisionStartTimeoutRef.current);
      collisionStartTimeoutRef.current = null;
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
    const now = Date.now();
    if (now < collisionBackoffUntilMsRef.current) {
      return;
    }
    const snapshot = getSnapshot({ consumeDistance: false });
    const hasRecentPedometerActivity =
      snapshot.effectiveSpeedStepsPerMs > 0 ||
      (snapshot.timeSincePedoMs >= 0 && snapshot.timeSincePedoMs <= COLLISION_RECENT_PEDOMETER_MS);
    const minCollisionIntervalMs = hasRecentPedometerActivity
      ? COLLISION_WALKING_MIN_INTERVAL_MS
      : COLLISION_IDLE_MIN_INTERVAL_MS;
    if (now - lastCollisionCaptureAtMsRef.current < minCollisionIntervalMs) {
      return;
    }
    if (
      hasRecentPedometerActivity &&
      now - lastProgressRunAtMsRef.current < COLLISION_PROGRESS_PRIORITY_WINDOW_MS
    ) {
      return;
    }
    lastCollisionCaptureAtMsRef.current = now;
    collisionFrameInFlightRef.current = true;
    try {
      const imageBase64 = await captureBase64Frame({
        width: COLLISION_FRAME_WIDTH,
        compress: COLLISION_FRAME_COMPRESS,
      });
      if (!imageBase64) return;
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
      const elapsedMs = Date.now() - now;
      if (elapsedMs >= COLLISION_OVERLOAD_MS) {
        collisionBackoffUntilMsRef.current = Date.now() + COLLISION_OVERLOAD_BACKOFF_MS;
      }
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
      if (currentInterval === 3) setCollisionRiskLevel("high");
      else if (currentInterval === 2) setCollisionRiskLevel("medium");
      else if (currentInterval === 1) setCollisionRiskLevel("low");
      else setCollisionRiskLevel("safe");

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
        setCollisionRiskLevel("safe");
      }
    } else {
      lastIntervalRef.current = 0; // Reset if no objects detected in frame
      setCollisionRiskLevel("safe");
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
  const orientationAlignedStartedAtMsRef = React.useRef<number | null>(null);
  const orientationProgressLoopRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const orientationCompletionInFlightRef = React.useRef(false);
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

  const stopOrientationProgressLoop = React.useCallback(() => {
    if (orientationProgressLoopRef.current) {
      clearInterval(orientationProgressLoopRef.current);
      orientationProgressLoopRef.current = null;
    }
  }, []);

  React.useEffect(() => {
    if (!isOrienting) {
      stopOrientationProgressLoop();
      orientationAlignedStartedAtMsRef.current = null;
      setOrientationHoldProgress(0);
      setOrientationIntroComplete(false);
      void stopOrientationFeedback();
      return;
    }

    setOrientationIntroComplete(false);
    stopOrientationProgressLoop();
    orientationAlignedStartedAtMsRef.current = null;
    setOrientationHoldProgress(0);
    void stopOrientationFeedback();
    Speech.stop();
    let cancelled = false;
    Speech.speak(ORIENTATION_PROMPT_TEXT, {
      language: "en",
      onDone: () => {
        if (!cancelled) {
          setOrientationIntroComplete(true);
        }
      },
      onStopped: () => {
        if (!cancelled) {
          setOrientationIntroComplete(true);
        }
      },
      onError: () => {
        if (!cancelled) {
          setOrientationIntroComplete(true);
        }
      },
    });

    return () => {
      cancelled = true;
      Speech.stop();
      stopOrientationProgressLoop();
      void stopOrientationFeedback();
    };
  }, [isOrienting, stopOrientationFeedback, stopOrientationProgressLoop]);

  React.useEffect(() => {
    if (!isOrienting || !orientationIntroComplete) {
      void stopOrientationFeedback();
      return;
    }
    void startOrientationFeedback();
    return () => {
      void stopOrientationFeedback();
    };
  }, [isOrienting, orientationIntroComplete, startOrientationFeedback, stopOrientationFeedback]);

  React.useEffect(() => {
    if (!isOrienting || !orientationIntroComplete) {
      return;
    }

    const hasOrientationHeading = typeof orientationTargetHeading === "number";
    if (!hasOrientationHeading) {
      setNavigationMode("navigating");
      return;
    }

    const isAligned = orientationAlignment === "aligned";
    updateOrientationFeedback({
      alignment: orientationAlignment,
      absErrorDeg: orientationAbsErrorDeg,
      isAligned,
    });

    if (!isAligned) {
      stopOrientationProgressLoop();
      orientationAlignedStartedAtMsRef.current = null;
      setOrientationHoldProgress(0);
      return;
    }

    const now = Date.now();
    if (orientationAlignedStartedAtMsRef.current === null) {
      orientationAlignedStartedAtMsRef.current = now;
      setOrientationHoldProgress(0);
    }
  }, [
    isOrienting,
    orientationIntroComplete,
    orientationAbsErrorDeg,
    orientationAlignment,
    orientationTargetHeading,
    stopOrientationProgressLoop,
    updateOrientationFeedback,
  ]);

  React.useEffect(() => {
    if (!isOrienting || !orientationIntroComplete || orientationAlignment !== "aligned") {
      stopOrientationProgressLoop();
      return;
    }

    if (orientationAlignedStartedAtMsRef.current === null) {
      return;
    }

    stopOrientationProgressLoop();
    orientationProgressLoopRef.current = setInterval(() => {
      if (orientationAlignedStartedAtMsRef.current === null) {
        return;
      }
      const elapsedMs = Date.now() - orientationAlignedStartedAtMsRef.current;
      const nextProgress = Math.min(elapsedMs / ORIENTATION_ALIGN_HOLD_MS, 1);
      setOrientationHoldProgress(nextProgress);
      if (nextProgress >= 1) {
        stopOrientationProgressLoop();
        if (!orientationCompletionInFlightRef.current) {
          orientationCompletionInFlightRef.current = true;
          void (async () => {
            await playAlignedCompletionDing();
            setNavigationMode("navigating");
            setOrientationHoldProgress(0);
            orientationAlignedStartedAtMsRef.current = null;
            orientationCompletionInFlightRef.current = false;
          })();
        }
      }
    }, ORIENTATION_PROGRESS_TICK_MS);

    return () => {
      stopOrientationProgressLoop();
    };
  }, [
    isOrienting,
    orientationIntroComplete,
    orientationAlignment,
    playAlignedCompletionDing,
    stopOrientationProgressLoop,
  ]);

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
    if (
      isOrienting ||
      !speakerMode ||
      !navigationInstructions ||
      navigationInstructions.length === 0 ||
      !activeInstruction
    ) {
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
    isOrienting,
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
        const firstInstructionHeading = normalizedInstructions[0]?.heading_degrees;
        setNavigationMode(
          typeof firstInstructionHeading === "number" ? "orienting" : "navigating",
        );
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
    if (!navigationSessionId || isOrienting) {
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

        // collisionStartTimeoutRef.current = setTimeout(() => {
        //   if (cancelled) return;
        //   collisionLoopRef.current = setInterval(() => {
        //     void sendCollisionFrameRef.current();
        //   }, COLLISION_SCHEDULER_TICK_MS);
        //   void sendCollisionFrameRef.current();
        // }, COLLISION_START_STAGGER_MS);
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
  }, [isOrienting, navigationSessionId, stopStreamingLoops]);

  React.useEffect(() => {
    // Only start the interval if all required conditions are met
    if (!navigationSessionId || isOrienting || !cameraMode || wsStatus !== "connected") {
      return; // Returns immediately, no background loops created
    }

    console.log("▶️ Collision loop started!");
    // Start the collision loop
    const timeoutId = setTimeout(() => {
      collisionLoopRef.current = setInterval(() => {
        void sendCollisionFrameRef.current();
      }, COLLISION_SCHEDULER_TICK_MS);
      
      // Fire the first frame immediately
      void sendCollisionFrameRef.current();
    }, COLLISION_START_STAGGER_MS);

    // Clean up function: Automatically destroys loops when cameraMode becomes false
    return () => {
      console.log("⏹️ Collision loop destroyed (Cleanup executed).");
      clearTimeout(timeoutId);
      if (collisionLoopRef.current) {
        clearInterval(collisionLoopRef.current);
        collisionLoopRef.current = null;
      }
    };
  }, [navigationSessionId, isOrienting, cameraMode, wsStatus]);


  React.useEffect(() => {
    if (!navigationSessionId || isOrienting) {
      return;
    }
    localProgressLoopRef.current = setInterval(() => {
      if (instructionCountRef.current === 0) return;
      lastProgressRunAtMsRef.current = Date.now();
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
  }, [getProgressSnapshot, isOrienting, navigationSessionId]);

  React.useEffect(() => {
    if (!showDebugBackground || isOrienting) {
      return;
    }
    const interval = setInterval(() => {
      const snapshot = getSnapshot({ consumeDistance: false });
      setLastSensorSnapshot(snapshot);
    }, DEBUG_SENSOR_POLL_MS);
    return () => {
      clearInterval(interval);
    };
  }, [getSnapshot, isOrienting, showDebugBackground]);

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
  const collisionRiskColor =
    collisionRiskLevel === "high"
      ? colors.danger
      : collisionRiskLevel === "medium"
      ? "#F97316"
      : collisionRiskLevel === "low"
      ? "#EAB308"
      : colors.primary;

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
    cameraMode
      ? React.createElement(CameraView, {
          ref: cameraRef,
          style: styles.cameraBackground,
          facing: "back",
        })
      : React.createElement(
          View,
          {
            style: [
              styles.cameraBackground,
              {
                backgroundColor: "#000000",
                justifyContent: "center",
                alignItems: "center",
                gap: spacing.md,
              },
            ],
          },
          React.createElement(Feather, {
            name: "camera-off",
            size: 48,
            color: colors.textSecondary,
          }),
          React.createElement(
            Text,
            { style: { ...typography.h3, color: colors.textSecondary } },
            "Camera Mode Disabled"
          )
        ),

    React.createElement(
      SafeAreaView,
      {
        style: styles.overlay,
        edges: ["top"] as const,
      },
      React.createElement(
        View,
        {
          style: [
            styles.swipeableOverlay,
            styles.swipeableOverlayCamera,
            isOrienting ? styles.swipeableOverlayOrientation : null,
          ],
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
          !isOrienting &&
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
              `Raw pedometer: events=${lastSensorSnapshot?.pedometerEventCount ?? "n/a"} | last delta=${lastSensorSnapshot?.lastPedometerDeltaSteps ?? "n/a"} steps | callback dt=${lastSensorSnapshot?.lastPedometerDeltaTimeMs ?? "n/a"} ms | last event ${lastSensorSnapshot?.lastPedometerEventAtMs ? `${Math.round((Date.now() - lastSensorSnapshot.lastPedometerEventAtMs) / 100) / 10}s ago` : "n/a"}`,
            ),
            React.createElement(
              Text,
              { style: styles.debugLine },
              `Interpolation: ${lastSensorSnapshot?.interpolationApplied ? "on" : "off"} | age: ${lastSensorSnapshot?.timeSincePedoMs ?? "n/a"} ms | last collision send: ${lastCollisionSendAtMs ? `${Math.round((Date.now() - lastCollisionSendAtMs) / 100) / 10}s ago` : "n/a"}`,
            ),
          ),
      ),
      isOrienting &&
        React.createElement(View, { style: styles.orientationDimmer }),
      isOrienting &&
        React.createElement(
          View,
          { style: styles.orientationCardContainer, pointerEvents: "none" },
          React.createElement(
            View,
            { style: styles.orientationCard },
            React.createElement(
              Text,
              { style: styles.orientationInstructionText },
              orientationInstructionText,
            ),
            React.createElement(
              View,
              { style: styles.orientationCompassWrapper },
              React.createElement(
                View,
                { style: styles.orientationRing },
                Array.from({ length: ORIENTATION_RING_SEGMENTS }).map((_, index) =>
                  React.createElement(View, {
                    key: `orientation-ring-segment-${index}`,
                    style: [
                      styles.orientationRingSegment,
                      {
                        transform: [
                          {
                            rotate: `${(index / ORIENTATION_RING_SEGMENTS) * 360}deg`,
                          },
                          { translateY: -126 },
                        ],
                        backgroundColor:
                          index < orientationProgressSegmentsLit
                            ? colors.primary
                            : "#CBD5E1",
                      },
                    ],
                  }),
                ),
              ),
              React.createElement(
                View,
                { style: styles.orientationCompassCenter },
                React.createElement(
                  Text,
                  { style: styles.orientationCurrentHeadingText },
                  orientationCurrentHeading == null ? "--°" : `${orientationCurrentHeading}°`,
                ),
                React.createElement(
                  Text,
                  { style: styles.orientationTargetHeadingText },
                  `Target ${orientationTargetHeadingRounded == null ? "--°" : `${orientationTargetHeadingRounded}°`}`,
                ),
              ),
            ),
          ),
        ),
    ),

    params.name &&
      navigationInstructions &&
      !isOrienting &&
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
        React.createElement(View, {
          style: [styles.collisionRiskBar, { backgroundColor: collisionRiskColor }],
        }),
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
            React.createElement(
              View,
              { style: styles.bottomNavMetaRow },
              totalDistanceFeet !== null &&
                React.createElement(
                  Text,
                  { style: styles.bottomNavDistance },
                  `${totalDistanceFeet} ft`,
                ),
              React.createElement(
                View,
                { style: styles.alignmentBadge },
                React.createElement(Ionicons, {
                  name: "compass-outline",
                  size: 16,
                  color: colors.textSecondary,
                  style: styles.alignmentBadgeIcon,
                }),
                React.createElement(
                  Text,
                  { style: styles.alignmentText },
                  roundedHeading == null ? "--°" : `${roundedHeading}°`,
                ),
                React.createElement(View, {
                  style: [
                    styles.alignmentIndicator,
                    {
                      backgroundColor: isAlignedWithInstructionHeading
                        ? colors.primary
                        : colors.secondary,
                    },
                  ],
                }),
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
  swipeableOverlayOrientation: {
    opacity: 0.72,
  },
  orientationBackgroundDisabled: {
    opacity: 0.62,
  },
  orientationDimmer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#11111166",
  },
  orientationCardContainer: {
    position: "absolute",
    left: spacing.md,
    right: spacing.md,
    top: "28%",
    zIndex: 12,
  },
  orientationCard: {
    borderRadius: 16,
    backgroundColor: "#FFFFFFF2",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.secondary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 5,
    alignItems: "center",
    gap: spacing.sm,
  },
  orientationInstructionText: {
    ...typography.body,
    color: colors.text,
    textAlign: "center",
  },
  orientationCompassWrapper: {
    width: 272,
    height: 272,
    justifyContent: "center",
    alignItems: "center",
  },
  orientationRing: {
    position: "absolute",
    width: "100%",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
  },
  orientationRingSegment: {
    position: "absolute",
    width: 5,
    height: 18,
    borderRadius: 999,
  },
  orientationCompassCenter: {
    width: 200,
    height: 200,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: "#D1D5DB",
    backgroundColor: "#FFFFFFEE",
    justifyContent: "center",
    alignItems: "center",
  },
  orientationCurrentHeadingText: {
    ...typography.h1,
    fontSize: 54,
    color: colors.text,
    lineHeight: 60,
  },
  orientationTargetHeadingText: {
    ...typography.label,
    marginTop: spacing.xs,
    color: colors.textSecondary,
    fontSize: 16,
  },
  orientationProgressLabel: {
    ...typography.label,
    color: colors.text,
    textAlign: "center",
    marginTop: spacing.xs,
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
  collisionRiskBar: {
    height: 10,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#00000022",
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
    fontSize: 18,
    color: colors.textSecondary,
  },
  bottomNavMetaRow: {
    marginTop: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  alignmentBadge: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    backgroundColor: colors.backgroundSecondary,
  },
  alignmentBadgeIcon: {
    marginRight: 4,
  },
  alignmentIndicator: {
    width: 8,
    height: 8,
    borderRadius: 999,
    marginLeft: spacing.xs,
  },
  alignmentText: {
    ...typography.label,
    fontSize: 14,
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