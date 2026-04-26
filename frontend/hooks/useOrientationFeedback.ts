import * as React from "react";
import * as Haptics from "expo-haptics";
import { Audio, type AVPlaybackSource, type AVPlaybackStatus } from "expo-av";
import type { HeadingAlignment } from "./useHeading";

const ORIENTATION_POLL_MS = 100;
const ALIGNMENT_WHOOP_DURATION_MS = 1500;
const ALIGNMENT_WHOOP_VOLUME_TICK_MS = 100;
const FALLBACK_DING_WAIT_MS = 500;
const MAX_DING_WAIT_MS = 2000;

type FeedbackState = {
  alignment: HeadingAlignment;
  absErrorDeg: number;
  isAligned: boolean;
};

function getCueIntervalMs(absErrorDeg: number): number {
  if (absErrorDeg <= 60) return 160;
  if (absErrorDeg <= 120) return 240;
  return 400;
}

async function createLoadedSound(source: AVPlaybackSource): Promise<Audio.Sound> {
  const { sound } = await Audio.Sound.createAsync(source, {
    shouldPlay: false,
    volume: 1,
    isLooping: false,
    progressUpdateIntervalMillis: 50,
  });
  return sound;
}

export function useOrientationFeedback() {
  const leftSoundRef = React.useRef<Audio.Sound | null>(null);
  const rightSoundRef = React.useRef<Audio.Sound | null>(null);
  const alignedWhoopSoundRef = React.useRef<Audio.Sound | null>(null);
  const alignedDingSoundRef = React.useRef<Audio.Sound | null>(null);
  const startedRef = React.useRef(false);
  const intervalRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const alignWhoopVolumeLoopRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const alignedStartedAtMsRef = React.useRef<number | null>(null);
  const lastCueAtMsRef = React.useRef(0);
  const lastDirectionRef = React.useRef<HeadingAlignment>("unknown");
  const wasAlignedRef = React.useRef(false);
  const feedbackStateRef = React.useRef<FeedbackState>({
    alignment: "unknown",
    absErrorDeg: 180,
    isAligned: false,
  });

  const stopInterval = React.useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const stopAlignWhoopVolumeLoop = React.useCallback(() => {
    if (alignWhoopVolumeLoopRef.current) {
      clearInterval(alignWhoopVolumeLoopRef.current);
      alignWhoopVolumeLoopRef.current = null;
    }
  }, []);

  const playAlignedCompletionDing = React.useCallback(async () => {
    try {
      const sound = alignedDingSoundRef.current;
      if (!sound) return;
      const status: AVPlaybackStatus = await sound.replayAsync();
      let waitMs = FALLBACK_DING_WAIT_MS;
      if (status.isLoaded) {
        const durationMs =
          typeof status.durationMillis === "number" ? status.durationMillis : null;
        const positionMs =
          typeof status.positionMillis === "number" ? status.positionMillis : 0;
        if (durationMs !== null) {
          waitMs = Math.max(durationMs - positionMs, 0);
        }
      }
      const boundedWaitMs = Math.min(waitMs + 50, MAX_DING_WAIT_MS);
      if (boundedWaitMs > 0) {
        await new Promise<void>((resolve) => {
          setTimeout(resolve, boundedWaitMs);
        });
      }
    } catch (error) {
      console.warn("Failed playing orientation completion ding:", error);
    }
  }, []);

  const stopAlignedWhoop = React.useCallback(async () => {
    stopAlignWhoopVolumeLoop();
    alignedStartedAtMsRef.current = null;
    try {
      await alignedWhoopSoundRef.current?.stopAsync();
      await alignedWhoopSoundRef.current?.setVolumeAsync(0.15);
    } catch (error) {
      console.warn("Failed stopping orientation aligned whoop:", error);
    }
  }, [stopAlignWhoopVolumeLoop]);

  const startAlignedWhoop = React.useCallback(async () => {
    const sound = alignedWhoopSoundRef.current;
    if (!sound) return;
    alignedStartedAtMsRef.current = Date.now();
    stopAlignWhoopVolumeLoop();
    try {
      await sound.setVolumeAsync(0.15);
      await sound.replayAsync();
    } catch (error) {
      console.warn("Failed starting orientation aligned whoop:", error);
      return;
    }

    alignWhoopVolumeLoopRef.current = setInterval(() => {
      if (alignedStartedAtMsRef.current === null || !alignedWhoopSoundRef.current) {
        return;
      }
      const elapsedMs = Date.now() - alignedStartedAtMsRef.current;
      const progress = Math.min(elapsedMs / ALIGNMENT_WHOOP_DURATION_MS, 1);
      const nextVolume = 0.15 + progress * 0.85;
      void alignedWhoopSoundRef.current.setVolumeAsync(nextVolume).catch((error) => {
        console.warn("Failed ramping orientation aligned whoop volume:", error);
      });
      if (progress >= 1) {
        stopAlignWhoopVolumeLoop();
      }
    }, ALIGNMENT_WHOOP_VOLUME_TICK_MS);
  }, [stopAlignWhoopVolumeLoop]);

  const playDirectionalCue = React.useCallback(
    async (alignment: HeadingAlignment) => {
      const sound = alignment === "turn_left" ? leftSoundRef.current : rightSoundRef.current;
      if (!sound) return;
      try {
        await sound.replayAsync();
      } catch (error) {
        console.warn("Failed to replay orientation directional cue:", error);
      }
    },
    [],
  );

  const triggerPulse = React.useCallback(async (absErrorDeg: number) => {
    try {
      if (absErrorDeg <= 12) {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      } else if (absErrorDeg <= 30) {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      } else {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    } catch (error) {
      console.warn("Failed to trigger orientation haptic pulse:", error);
    }
  }, []);

  const stop = React.useCallback(async () => {
    stopInterval();
    await stopAlignedWhoop();
    lastCueAtMsRef.current = 0;
    lastDirectionRef.current = "unknown";
    wasAlignedRef.current = false;
    feedbackStateRef.current = {
      alignment: "unknown",
      absErrorDeg: 180,
      isAligned: false,
    };
    try {
      await Promise.all([
        leftSoundRef.current?.stopAsync(),
        rightSoundRef.current?.stopAsync(),
      ]);
    } catch (error) {
      console.warn("Failed stopping orientation cue playback:", error);
    }
  }, [stopAlignedWhoop, stopInterval]);

  const update = React.useCallback((state: FeedbackState) => {
    feedbackStateRef.current = state;
  }, []);

  const start = React.useCallback(async () => {
    if (startedRef.current) return;
    startedRef.current = true;

    try {
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        allowsRecordingIOS: false,
      });
      leftSoundRef.current = await createLoadedSound(
        require("../assets/audio/orientation/turn_left.wav"),
      );
      rightSoundRef.current = await createLoadedSound(
        require("../assets/audio/orientation/turn_right.wav"),
      );
      alignedWhoopSoundRef.current = await createLoadedSound(
        require("../assets/audio/orientation/aligned_whoop.wav"),
      );
      alignedDingSoundRef.current = await createLoadedSound(
        require("../assets/audio/orientation/aligned_ding.wav"),
      );
    } catch (error) {
      console.warn("Failed to load orientation feedback sounds:", error);
    }

    intervalRef.current = setInterval(() => {
      const state = feedbackStateRef.current;
      const now = Date.now();
      const directionChanged = state.alignment !== lastDirectionRef.current;

      if (state.isAligned) {
        if (!wasAlignedRef.current) {
          wasAlignedRef.current = true;
          void startAlignedWhoop();
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
            (error) => {
              console.warn("Failed to trigger orientation align haptic:", error);
            },
          );
        }
        return;
      }

      wasAlignedRef.current = false;
      void stopAlignedWhoop();

      if (state.alignment !== "turn_left" && state.alignment !== "turn_right") {
        return;
      }

      if (directionChanged) {
        lastCueAtMsRef.current = 0;
      }
      lastDirectionRef.current = state.alignment;

      const cueIntervalMs = getCueIntervalMs(state.absErrorDeg);
      if (now - lastCueAtMsRef.current < cueIntervalMs) {
        return;
      }
      lastCueAtMsRef.current = now;

      void playDirectionalCue(state.alignment);
      void triggerPulse(state.absErrorDeg);
    }, ORIENTATION_POLL_MS);
  }, [playDirectionalCue, startAlignedWhoop, stopAlignedWhoop, triggerPulse]);

  React.useEffect(() => {
    return () => {
      stopInterval();
      const leftSound = leftSoundRef.current;
      const rightSound = rightSoundRef.current;
      const alignedWhoopSound = alignedWhoopSoundRef.current;
      const alignedDingSound = alignedDingSoundRef.current;
      leftSoundRef.current = null;
      rightSoundRef.current = null;
      alignedWhoopSoundRef.current = null;
      alignedDingSoundRef.current = null;
      startedRef.current = false;
      stopAlignWhoopVolumeLoop();
      if (leftSound) {
        void leftSound.unloadAsync();
      }
      if (rightSound) {
        void rightSound.unloadAsync();
      }
      if (alignedWhoopSound) {
        void alignedWhoopSound.unloadAsync();
      }
      if (alignedDingSound) {
        void alignedDingSound.unloadAsync();
      }
    };
  }, [stopAlignWhoopVolumeLoop, stopInterval]);

  return {
    start,
    stop,
    update,
    playAlignedCompletionDing,
  };
}
