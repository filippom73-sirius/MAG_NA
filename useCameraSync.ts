import { useCallback, useRef, useState } from "react";
import { Platform } from "react-native";

export interface CameraSyncHandle {
  takePictureAsync(opts: {
    quality?: number;
    base64?: boolean;
    skipProcessing?: boolean;
    exif?: boolean;
  }): Promise<{ base64?: string; uri: string }>;
}

export type CalibState = "none" | "dark_done" | "ready";

interface UseCameraSyncOptions {
  onPulse: (timestamp: number, pulseIndex: number) => void;
  captureIntervalMs?: number;
  windowsPerRevolution?: number;
}

/**
 * useCameraSync — optical encoder via phone camera.
 *
 * How it works:
 *  - Takes low-quality JPEG snapshots at ~7 fps
 *  - Uses base64 string length as inverse-brightness proxy:
 *    white/uniform → high JPEG compression → short string
 *    dark/textured  → low  JPEG compression → long  string
 *  - Calibration (SCURO → BIANCO) sets the dark and bright reference lengths
 *  - Detects dark→bright rising edges (window appearing) → pulse
 *  - Each pulse = one encoder window = 360° / windowsPerRevolution
 */
export function useCameraSync({
  onPulse,
  captureIntervalMs = 140,
  windowsPerRevolution = 8,
}: UseCameraSyncOptions) {
  const cameraRef = useRef<CameraSyncHandle | null>(null);

  const [brightness, setBrightness] = useState(0);
  const [pulseCount, setPulseCount] = useState(0);
  const [estimatedRPM, setEstimatedRPM] = useState<number | null>(null);
  const [isActive, setIsActive] = useState(false);
  const [calibState, setCalibState] = useState<CalibState>("none");
  const [intervalHistory, setIntervalHistory] = useState<number[]>([]);

  // Calibrated JPEG base64 lengths (shorter = brighter)
  const calibDarkLen = useRef<number | null>(null);
  const calibBrightLen = useRef<number | null>(null);

  // Detection state
  const lastBinary = useRef<"bright" | "dark">("dark");
  const lastPulseTs = useRef(0);
  const pulseTsArr = useRef<number[]>([]);
  const pulseCountRef = useRef(0);
  const captureTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const isActiveRef = useRef(false);
  const inFlight = useRef(false);

  const scoreBrightness = useCallback((len: number): number => {
    const dark = calibDarkLen.current ?? 10000;
    const bright = calibBrightLen.current ?? 500;
    if (bright >= dark) return 128;
    const norm = 1 - (len - bright) / (dark - bright);
    return Math.round(Math.max(0, Math.min(255, norm * 255)));
  }, []);

  const captureFrame = useCallback(async () => {
    if (!isActiveRef.current || inFlight.current || !cameraRef.current) return;
    if (Platform.OS === "web") return;

    inFlight.current = true;
    try {
      const pic = await cameraRef.current.takePictureAsync({
        quality: 0.01,
        base64: true,
        skipProcessing: true,
        exif: false,
      });

      if (!pic.base64 || !isActiveRef.current) return;

      const len = pic.base64.length;
      const bri = scoreBrightness(len);
      setBrightness(bri);

      const darkLen = calibDarkLen.current ?? 10000;
      const brightLen = calibBrightLen.current ?? 500;
      const threshold = (darkLen + brightLen) / 2;
      const current: "bright" | "dark" = len < threshold ? "bright" : "dark";

      // Rising edge: dark → bright (window appearing)
      const now = Date.now();
      if (
        current === "bright" &&
        lastBinary.current === "dark" &&
        now - lastPulseTs.current > 80 // debounce
      ) {
        lastPulseTs.current = now;
        pulseCountRef.current += 1;
        const idx = pulseCountRef.current;
        setPulseCount(idx);
        pulseTsArr.current.push(now);

        // Estimate RPM + update interval history
        const ts = pulseTsArr.current;
        if (ts.length >= 2) {
          const newInterval = now - ts[ts.length - 2];
          // Keep last 32 intervals for histogram
          setIntervalHistory((prev) => {
            const next = [...prev, newInterval];
            return next.length > 32 ? next.slice(next.length - 32) : next;
          });

          const recent = ts.slice(Math.max(0, ts.length - (windowsPerRevolution + 1)));
          const intervals: number[] = [];
          for (let i = 1; i < recent.length; i++) {
            intervals.push(recent[i] - recent[i - 1]);
          }
          const avgMs = intervals.reduce((a, b) => a + b, 0) / intervals.length;
          if (avgMs > 0) {
            const rpm = 60000 / (windowsPerRevolution * avgMs);
            setEstimatedRPM(Math.max(0.01, Math.min(999, rpm)));
          }
        }

        onPulse(now, idx);
      }

      lastBinary.current = current;
    } catch {
      // ignore camera errors (busy, permissions, etc.)
    } finally {
      inFlight.current = false;
    }
  }, [scoreBrightness, onPulse, windowsPerRevolution]);

  const start = useCallback(() => {
    isActiveRef.current = true;
    inFlight.current = false;
    pulseCountRef.current = 0;
    pulseTsArr.current = [];
    lastBinary.current = "dark";
    lastPulseTs.current = 0;
    setPulseCount(0);
    setEstimatedRPM(null);
    setBrightness(0);
    setIntervalHistory([]);
    setIsActive(true);
    captureTimer.current = setInterval(captureFrame, captureIntervalMs);
  }, [captureFrame, captureIntervalMs]);

  const stop = useCallback(() => {
    isActiveRef.current = false;
    inFlight.current = false;
    setIsActive(false);
    if (captureTimer.current) {
      clearInterval(captureTimer.current);
      captureTimer.current = null;
    }
  }, []);

  const doCalibCapture = useCallback(async (): Promise<number | null> => {
    if (!cameraRef.current || Platform.OS === "web") return null;
    try {
      const pic = await cameraRef.current.takePictureAsync({
        quality: 0.01,
        base64: true,
        skipProcessing: true,
        exif: false,
      });
      return pic.base64?.length ?? null;
    } catch {
      return null;
    }
  }, []);

  const calibrateDark = useCallback(async () => {
    const len = await doCalibCapture();
    if (len !== null) {
      calibDarkLen.current = len;
      const hasBright = calibBrightLen.current !== null;
      setCalibState(hasBright ? "ready" : "dark_done");
    }
  }, [doCalibCapture]);

  const calibrateBright = useCallback(async () => {
    const len = await doCalibCapture();
    if (len !== null) {
      calibBrightLen.current = len;
      const hasDark = calibDarkLen.current !== null;
      setCalibState(hasDark ? "ready" : "none");
    }
  }, [doCalibCapture]);

  const resetCalib = useCallback(() => {
    calibDarkLen.current = null;
    calibBrightLen.current = null;
    setCalibState("none");
    stop();
  }, [stop]);

  return {
    cameraRef,
    brightness,
    pulseCount,
    estimatedRPM,
    intervalHistory,
    isActive,
    calibState,
    isCalibrated: calibState === "ready",
    start,
    stop,
    calibrateDark,
    calibrateBright,
    resetCalib,
  };
}
