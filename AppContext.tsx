import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { Alert, Platform } from "react-native";
import { useMagnetometer } from "@/hooks/useMagnetometer";

export type DataPoint = { angle: number; x: number; y: number; z: number };
export type Session = { z: number; data: DataPoint[] };
export type TabId =
  | "oscilloscope"
  | "polar"
  | "heatmap"
  | "fem2d"
  | "unrolled2d"
  | "export";
export type AppMode = "simulation" | "remote";
export type RecordingPhase = "idle" | "trigger_capture" | "sampling";

export interface DefectZone {
  enabled: boolean;
  angle: number;   // 0–360 degrees, center of defect
  width: number;   // degrees, total angular width
  depth: number;   // 0–100, % flux reduction at center
}

const WINDOWS_PER_REV = 8; // encoder windows (white slots) per revolution
const DEG_PER_WINDOW = 360 / WINDOWS_PER_REV; // 45°

interface AppContextType {
  mode: AppMode;
  setMode: (m: AppMode) => void;
  activeTab: TabId;
  setActiveTab: (t: TabId) => void;

  // Recording state
  isRecording: boolean;
  recordingPhase: RecordingPhase;
  data: DataPoint[];
  currentAngle: number;
  failFactor: number;
  sessions: Session[];
  triggerRPM: number | null;
  triggerProgress: number;

  // Config
  manualRPM: number;
  setManualRPM: (rpm: number) => void;
  paccoHeight: number;
  setPaccoHeight: (h: number) => void;
  fetteZ: number;
  setFetteZ: (n: number) => void;
  zOffset: number;
  setZOffset: (z: number) => void;
  selected2DStep: number;
  setSelected2DStep: (z: number) => void;
  h0Slice: number;
  setH0Slice: (z: number) => void;
  h1Slice: number;
  setH1Slice: (z: number) => void;
  targetRotations: number;
  setTargetRotations: (n: number) => void;
  triggerCapRotations: number;
  setTriggerCapRotations: (n: number) => void;
  liveRPM: number | null;
  useAutoTrigger: boolean;
  setUseAutoTrigger: (v: boolean) => void;

  // Remote encoder sync
  cameraEstimatedRPM: number | null;
  receiveCameraPulse: (timestamp: number, pulseIndex: number) => void;

  // Defect zone simulation (SIM mode only)
  simDefectEnabled: boolean;
  setSimDefectEnabled: (v: boolean) => void;
  defectAngle: number;
  setDefectAngle: (v: number) => void;
  defectWidth: number;
  setDefectWidth: (v: number) => void;
  defectDepth: number;
  setDefectDepth: (v: number) => void;

  // Display options
  showFluxLines: boolean;
  setShowFluxLines: (v: boolean) => void;
  show2DFluxLines: boolean;
  setShow2DFluxLines: (v: boolean) => void;
  femGain: number;
  setFemGain: (g: number) => void;

  // Axis visibility
  showAxisX: boolean;
  setShowAxisX: (v: boolean) => void;
  showAxisY: boolean;
  setShowAxisY: (v: boolean) => void;
  showAxisZ: boolean;
  setShowAxisZ: (v: boolean) => void;
  showResultant: boolean;
  setShowResultant: (v: boolean) => void;

  // 3D view
  rotX: number;
  setRotX: (v: number | ((prev: number) => number)) => void;
  rotY: number;
  setRotY: (v: number | ((prev: number) => number)) => void;
  zoomScale: number;
  setZoomScale: (v: number | ((prev: number) => number)) => void;
  hiddenZSlices: number[];
  toggleZSliceVisibility: (z: number) => void;

  // Computed
  activeSteps: number[];
  MAX_FLUX: number;

  // Actions
  handleStart: () => void;
  handleStop: () => void;
  handleReset: () => void;
  clearHistory: () => void;
  exportToCSV: () => Promise<void>;
  setFailPressed: (v: boolean) => void;
}

const AppContext = createContext<AppContextType | null>(null);

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}

const MAX_FLUX = 2000;
const TRIGGER_ROTATIONS = 2;

function calculateSteps(paccoHeight: number, fetteZ: number): number[] {
  const N = Math.max(1, fetteZ);
  const steps: number[] = [];
  if (N === 1) {
    steps.push(Number((paccoHeight / 2).toFixed(1)));
  } else {
    for (let i = 0; i < N; i++) {
      steps.push(Number(((i * paccoHeight) / (N - 1)).toFixed(1)));
    }
  }
  return steps;
}

function generateSimulatedData(
  angle: number,
  ff: number = 1.0,
  defect: DefectZone = { enabled: false, angle: 90, width: 45, depth: 70 }
): DataPoint {
  const safeAngle = isNaN(angle) ? 0 : angle;
  const rad = (safeAngle * Math.PI) / 180;

  let localFf = ff;
  if (defect.enabled) {
    const delta = Math.abs(((safeAngle - defect.angle + 540) % 360) - 180);
    if (delta < defect.width / 2) {
      const fade = 1 - delta / (defect.width / 2);
      localFf = Math.max(0, ff * (1 - (defect.depth / 100) * fade));
    }
  }

  const signalX = Math.sin(4 * rad) * 1750 * localFf;
  const signalY = Math.cos(4 * rad) * 1600 * localFf;
  const signalZ = Math.sin(4 * rad + Math.PI / 4) * 900 * localFf;
  const noise = () => (Math.random() - 0.5) * (15 + 45 * localFf);
  return {
    angle: safeAngle,
    x: signalX + noise(),
    y: signalY + noise(),
    z: signalZ + noise(),
  };
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<AppMode>("simulation");
  const [activeTab, setActiveTab] = useState<TabId>("oscilloscope");
  const [isRecording, setIsRecording] = useState(false);
  const [recordingPhase, setRecordingPhase] = useState<RecordingPhase>("idle");
  const [data, setData] = useState<DataPoint[]>([]);
  const [currentAngle, setCurrentAngle] = useState(0);
  const [failFactor, setFailFactor] = useState(1.0);
  const [simDefectEnabled, setSimDefectEnabled] = useState(false);
  const [defectAngle, setDefectAngle] = useState(90);
  const [defectWidth, setDefectWidth] = useState(45);
  const [defectDepth, setDefectDepth] = useState(70);
  const simDefectRef = useRef<DefectZone>({ enabled: false, angle: 90, width: 45, depth: 70 });
  const [sessions, setSessions] = useState<Session[]>([]);
  const [triggerRPM, setTriggerRPM] = useState<number | null>(null);
  const [triggerProgress, setTriggerProgress] = useState(0);

  const [manualRPM, setManualRPMState] = useState(15.0);
  const [paccoHeight, setPaccoHeightState] = useState(24);
  const [fetteZ, setFetteZState] = useState(5);
  const [zOffset, setZOffsetState] = useState(0);
  const [selected2DStep, setSelected2DStep] = useState(0);
  const [h0Slice, setH0Slice] = useState(0);
  const [h1Slice, setH1Slice] = useState(0);
  const [targetRotations, setTargetRotations] = useState(1);
  const [triggerCapRotations, setTriggerCapRotationsState] = useState(TRIGGER_ROTATIONS);
  const triggerCapRotationsRef = useRef(TRIGGER_ROTATIONS);
  const [liveRPM, setLiveRPM] = useState<number | null>(null);
  const liveRPMRef = useRef<number | null>(null);
  const rotationTimestampsRef = useRef<number[]>([]);
  const [useAutoTrigger, setUseAutoTrigger] = useState(true);
  const useAutoTriggerRef = useRef(true);

  // Camera sync state
  const [cameraEstimatedRPM, setCameraEstimatedRPM] = useState<number | null>(null);
  const cameraRPMRef = useRef<number>(15.0);
  const lastCameraPulseTs = useRef<number>(0);

  const [showFluxLines, setShowFluxLines] = useState(true);
  const [show2DFluxLines, setShow2DFluxLines] = useState(true);
  const [femGain, setFemGain] = useState(2000);

  const [showAxisX, setShowAxisX] = useState(true);
  const [showAxisY, setShowAxisY] = useState(true);
  const [showAxisZ, setShowAxisZ] = useState(true);
  const [showResultant, setShowResultant] = useState(false);

  const [rotX, setRotX] = useState(-0.5);
  const [rotY, setRotY] = useState(0.8);
  const [zoomScale, setZoomScale] = useState(2.5);
  const [hiddenZSlices, setHiddenZSlices] = useState<number[]>([]);

  // Refs for animation loop (avoid stale closures)
  const isRecordingRef = useRef(false);
  const recordingPhaseRef = useRef<RecordingPhase>("idle");
  const failFactorRef = useRef(1.0);
  const isFailPressedRef = useRef(false);
  const modeRef = useRef<AppMode>("simulation");
  const magnetometerRef = useRef<{ x: number; y: number; z: number } | null>(null);
  const zOffsetRef = useRef(0);
  const targetRotationsRef = useRef(1);
  const manualRPMRef = useRef(15.0);
  const measuredRPMRef = useRef<number | null>(null);
  const currentAngleRef = useRef(0);
  const dataRef = useRef<DataPoint[]>([]);
  const requestRef = useRef<number>(0);
  const lastTimeRef = useRef<number | undefined>(undefined);
  const triggerStartTimeRef = useRef<number | undefined>(undefined);
  const frameCountRef = useRef(0);

  const activeSteps = calculateSteps(paccoHeight, fetteZ);

  // Feed real magnetometer values into magnetometerRef when in remote mode
  useMagnetometer(isRecording && mode === "remote", useCallback((d) => {
    magnetometerRef.current = d;
  }, []));

  // Sync refs
  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => { zOffsetRef.current = zOffset; }, [zOffset]);
  useEffect(() => { targetRotationsRef.current = targetRotations; }, [targetRotations]);
  useEffect(() => { manualRPMRef.current = manualRPM; }, [manualRPM]);

  useEffect(() => {
    if (activeSteps.length > 0) {
      if (!activeSteps.includes(zOffset)) {
        const newZ = activeSteps[0];
        setZOffsetState(newZ);
        zOffsetRef.current = newZ;
      }
      if (!activeSteps.includes(selected2DStep)) setSelected2DStep(activeSteps[0]);
      if (!activeSteps.includes(h0Slice)) setH0Slice(activeSteps[0]);
      if (!activeSteps.includes(h1Slice)) setH1Slice(activeSteps[Math.min(activeSteps.length - 1, 1)]);
    }
    setHiddenZSlices([]);
  }, [paccoHeight, fetteZ]);

  useEffect(() => {
    simDefectRef.current = { enabled: simDefectEnabled, angle: defectAngle, width: defectWidth, depth: defectDepth };
  }, [simDefectEnabled, defectAngle, defectWidth, defectDepth]);

  const getDataPoint = useCallback((angle: number): DataPoint => {
    return generateSimulatedData(angle, failFactorRef.current, simDefectRef.current);
  }, []);

  const updateSimulation = useCallback(
    (time: number) => {
      if (!isRecordingRef.current) return;

      if (lastTimeRef.current !== undefined) {
        const deltaTime = Math.max(0, time - lastTimeRef.current);

        // Fail factor update
        if (isFailPressedRef.current) {
          failFactorRef.current = Math.max(0, failFactorRef.current - deltaTime * 0.0008);
        } else {
          failFactorRef.current = Math.min(1.0, failFactorRef.current + deltaTime * 0.0016);
        }
        setFailFactor(failFactorRef.current);

        // In remote mode: interpolate angle using encoder RPM between pulses
        // (pulses snap the angle; RAF provides smooth interpolation)
        const isCameraMode = modeRef.current === "remote";

        const currentRPM = isCameraMode
          ? cameraRPMRef.current
          : recordingPhaseRef.current === "sampling" && measuredRPMRef.current !== null
            ? measuredRPMRef.current
            : manualRPMRef.current;

        const degreesPerMs = 360 / ((60 / Math.max(0.01, currentRPM)) * 1000);
        const safeDelta = isNaN(deltaTime) ? 0 : deltaTime;
        const nextAngle = currentAngleRef.current + safeDelta * degreesPerMs;

        if (recordingPhaseRef.current === "trigger_capture") {
          // Set trigger start time on first frame
          if (triggerStartTimeRef.current === undefined) {
            triggerStartTimeRef.current = time;
            rotationTimestampsRef.current = [time];
          }
          const numCapRot = triggerCapRotationsRef.current;
          const triggerMaxAngle = numCapRot * 360;

          // Detect completed full rotations for live RPM
          const prevRotation = Math.floor(currentAngleRef.current / 360);
          const nextRotation = Math.floor(nextAngle / 360);
          if (nextRotation > prevRotation && nextRotation <= numCapRot) {
            rotationTimestampsRef.current.push(time);
            const ts = rotationTimestampsRef.current;
            if (ts.length >= 2) {
              const intervals: number[] = [];
              for (let i = 1; i < ts.length; i++) intervals.push(ts[i] - ts[i - 1]);
              const avgMs = intervals.reduce((a, b) => a + b, 0) / intervals.length;
              const rpm = avgMs > 0 ? Math.max(0.01, Math.min(999, (60 * 1000) / avgMs)) : manualRPMRef.current;
              liveRPMRef.current = rpm;
              setLiveRPM(rpm);
            }
          }

          if (nextAngle >= triggerMaxAngle) {
            const elapsed = time - triggerStartTimeRef.current!;
            const computed = elapsed > 0
              ? (numCapRot * 60 * 1000) / elapsed
              : (liveRPMRef.current ?? manualRPMRef.current);
            const clampedRPM = Math.max(0.01, Math.min(999, computed));
            measuredRPMRef.current = clampedRPM;
            liveRPMRef.current = clampedRPM;
            setLiveRPM(clampedRPM);
            setTriggerRPM(clampedRPM);
            recordingPhaseRef.current = "sampling";
            setRecordingPhase("sampling");
            currentAngleRef.current = 0;
            dataRef.current = [];
            frameCountRef.current = 0;
            setData([]);
            setCurrentAngle(0);
            setTriggerProgress(triggerMaxAngle);
          } else {
            currentAngleRef.current = nextAngle;
            setTriggerProgress(nextAngle);
            setCurrentAngle(nextAngle);
          }
        } else {
          // Sampling phase (timer/camera mode interpolation)
          const safeRotations = Math.max(1, targetRotationsRef.current);
          const targetTotalAngle = safeRotations * 360;

          if (!isCameraMode && nextAngle >= targetTotalAngle) {
            // Timer mode: stop on angle target
            isRecordingRef.current = false;
            setIsRecording(false);
            recordingPhaseRef.current = "idle";
            setRecordingPhase("idle");
            currentAngleRef.current = targetTotalAngle;
            setCurrentAngle(targetTotalAngle);
          } else {
            // Advance angle (camera mode: RAF interpolation only; pulses snap via receiveCameraPulse)
            if (!isCameraMode) {
              currentAngleRef.current = nextAngle;
            } else {
              // In camera mode: RAF interpolates, but only records up to current pulse boundary
              // to avoid false data beyond the last known-good angle
              currentAngleRef.current = nextAngle;
            }
            // Remote mode: use real magnetometer values; SIM mode: use generated data
            let point: DataPoint;
            if (modeRef.current === "remote" && magnetometerRef.current !== null) {
              point = {
                angle: currentAngleRef.current,
                x: magnetometerRef.current.x,
                y: magnetometerRef.current.y,
                z: magnetometerRef.current.z,
              };
            } else {
              point = getDataPoint(currentAngleRef.current);
            }
            dataRef.current.push(point);
            frameCountRef.current++;
            if (frameCountRef.current % 4 === 0) {
              setCurrentAngle(currentAngleRef.current);
              setData([...dataRef.current]);
            }
          }
        }
      }

      lastTimeRef.current = time;
      if (isRecordingRef.current) {
        requestRef.current = requestAnimationFrame(updateSimulation);
      }
    },
    [getDataPoint]
  );

  // Save session when recording ends
  useEffect(() => {
    if (!isRecording && dataRef.current.length > 0) {
      const rawData = [...dataRef.current];
      const averagedData: DataPoint[] = [];
      for (let i = 0; i < 360; i++) {
        let sumX = 0, sumY = 0, sumZ = 0, count = 0;
        for (const d of rawData) {
          const norm = Math.floor(d.angle) % 360;
          if (norm === i) { sumX += d.x; sumY += d.y; sumZ += d.z; count++; }
        }
        if (count > 0) {
          averagedData.push({ angle: i, x: sumX / count, y: sumY / count, z: sumZ / count });
        } else {
          averagedData.push(modeRef.current === "remote"
          ? { angle: i, x: 0, y: 0, z: 0 }
          : generateSimulatedData(i, failFactorRef.current, simDefectRef.current));
        }
      }
      if (averagedData.length > 0) {
        const safeZ = zOffsetRef.current;
        setSessions((prev) => {
          const idx = prev.findIndex((s) => Math.abs(s.z - safeZ) < 0.1);
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = { z: safeZ, data: averagedData };
            return next;
          }
          return [...prev, { z: safeZ, data: averagedData }];
        });
      }
    }
  }, [isRecording]);

  useEffect(() => {
    if (isRecording) {
      requestRef.current = requestAnimationFrame(updateSimulation);
    } else {
      cancelAnimationFrame(requestRef.current);
      lastTimeRef.current = undefined;
    }
    return () => cancelAnimationFrame(requestRef.current);
  }, [isRecording]);

  const handleStart = useCallback(() => {
    dataRef.current = [];
    currentAngleRef.current = 0;
    frameCountRef.current = 0;
    triggerStartTimeRef.current = undefined;
    measuredRPMRef.current = null;
    liveRPMRef.current = null;
    rotationTimestampsRef.current = [];
    lastCameraPulseTs.current = 0;
    setData([]);
    setCurrentAngle(0);
    setTriggerRPM(null);
    setTriggerProgress(0);
    setLiveRPM(null);
    setCameraEstimatedRPM(null);
    if (!isFailPressedRef.current) {
      failFactorRef.current = 1.0;
      setFailFactor(1.0);
    }

    if (modeRef.current === "remote") {
      // Remote encoder mode: skip calibration phase, start sampling immediately
      // Use manualRPM as initial RPM estimate; encoder pulses will refine it
      cameraRPMRef.current = manualRPMRef.current;
      measuredRPMRef.current = manualRPMRef.current;
      setTriggerRPM(manualRPMRef.current);
      recordingPhaseRef.current = "sampling";
      setRecordingPhase("sampling");
    } else if (useAutoTriggerRef.current) {
      recordingPhaseRef.current = "trigger_capture";
      setRecordingPhase("trigger_capture");
    } else {
      measuredRPMRef.current = manualRPMRef.current;
      setTriggerRPM(manualRPMRef.current);
      recordingPhaseRef.current = "sampling";
      setRecordingPhase("sampling");
    }
    isRecordingRef.current = true;
    setIsRecording(true);
  }, []);

  /**
   * receiveCameraPulse — called by CameraSyncOverlay on each optical pulse.
   * Each pulse = one white window detected = DEG_PER_WINDOW (45°) encoder step.
   * Corrects currentAngle to exact grid position and updates RPM from timing.
   */
  const receiveCameraPulse = useCallback((timestamp: number, pulseIndex: number) => {
    if (!isRecordingRef.current || recordingPhaseRef.current !== "sampling") return;

    // Snap angle to exact encoder position (eliminates drift)
    const exactAngle = pulseIndex * DEG_PER_WINDOW;
    currentAngleRef.current = exactAngle;
    setCurrentAngle(exactAngle);

    // Compute RPM from inter-pulse interval
    if (lastCameraPulseTs.current > 0) {
      const dt = timestamp - lastCameraPulseTs.current;
      if (dt > 0 && dt < 30000) {
        const rpm = 60000 / (WINDOWS_PER_REV * dt);
        const clampedRPM = Math.max(0.01, Math.min(999, rpm));
        cameraRPMRef.current = clampedRPM;
        measuredRPMRef.current = clampedRPM;
        setCameraEstimatedRPM(clampedRPM);
        setTriggerRPM(clampedRPM);
      }
    }
    lastCameraPulseTs.current = timestamp;

    // Check if target rotations reached
    const safeRotations = Math.max(1, targetRotationsRef.current);
    if (exactAngle >= safeRotations * 360) {
      isRecordingRef.current = false;
      setIsRecording(false);
      recordingPhaseRef.current = "idle";
      setRecordingPhase("idle");
    }
  }, []);

  const handleStop = useCallback(() => {
    isRecordingRef.current = false;
    recordingPhaseRef.current = "idle";
    setIsRecording(false);
    setRecordingPhase("idle");
  }, []);

  const handleReset = useCallback(() => {
    isRecordingRef.current = false;
    isFailPressedRef.current = false;
    failFactorRef.current = 1.0;
    currentAngleRef.current = 0;
    dataRef.current = [];
    measuredRPMRef.current = null;
    liveRPMRef.current = null;
    rotationTimestampsRef.current = [];
    triggerStartTimeRef.current = undefined;
    lastCameraPulseTs.current = 0;
    recordingPhaseRef.current = "idle";
    setIsRecording(false);
    setRecordingPhase("idle");
    setData([]);
    setCurrentAngle(0);
    setFailFactor(1.0);
    setTriggerRPM(null);
    setTriggerProgress(0);
    setLiveRPM(null);
    setCameraEstimatedRPM(null);
  }, []);

  const clearHistory = useCallback(() => {
    setSessions([]);
    dataRef.current = [];
    setData([]);
    setCurrentAngle(0);
    setFailFactor(1.0);
    failFactorRef.current = 1.0;
  }, []);

  const setFailPressed = useCallback((v: boolean) => {
    isFailPressedRef.current = v;
  }, []);

  const setManualRPM = useCallback((rpm: number) => {
    const safe = Math.max(0.01, Math.min(99.99, Math.round(rpm * 100) / 100));
    manualRPMRef.current = safe;
    setManualRPMState(safe);
  }, []);

  const setPaccoHeight = useCallback((h: number) => {
    setPaccoHeightState(h);
    setSessions([]);
  }, []);

  const setFetteZ = useCallback((n: number) => {
    setFetteZState(n);
    setSessions([]);
  }, []);

  const setZOffset = useCallback((z: number) => {
    zOffsetRef.current = z;
    setZOffsetState(z);
  }, []);

  const toggleZSliceVisibility = useCallback((z: number) => {
    setHiddenZSlices((prev) =>
      prev.includes(z) ? prev.filter((v) => v !== z) : [...prev, z]
    );
  }, []);

  const setTriggerCapRotations = useCallback((n: number) => {
    const safe = Math.max(1, Math.min(10, n));
    triggerCapRotationsRef.current = safe;
    setTriggerCapRotationsState(safe);
  }, []);

  const handleSetUseAutoTrigger = useCallback((v: boolean) => {
    useAutoTriggerRef.current = v;
    setUseAutoTrigger(v);
  }, []);

  const setMode = useCallback((m: AppMode) => {
    modeRef.current = m;
    setModeState(m);
  }, []);

  const exportToCSV = useCallback(async () => {
    if (sessions.length === 0) {
      Alert.alert("Nessun dato", "Acquisire almeno una sessione prima di esportare.");
      return;
    }
    let csv = "Altezza Pacco (mm);Quota Z (mm);Angolo (Gradi);Flusso X (uT);Flusso Y (uT);Flusso Z (uT)\n";
    for (const session of sessions) {
      for (const row of session.data) {
        csv += `${paccoHeight};${session.z};${row.angle};${row.x.toFixed(1)};${row.y.toFixed(1)};${row.z.toFixed(1)}\n`;
      }
    }
    try {
      if (Platform.OS === "web") {
        Alert.alert("Export", "CSV export disponibile solo su dispositivo Android.");
        return;
      }
      const FileSystem = require("expo-file-system");
      const Sharing = require("expo-sharing");
      const fileName = `MAGNA_H${paccoHeight}_${Date.now()}.csv`;
      const fileUri = FileSystem.documentDirectory + fileName;
      await FileSystem.writeAsStringAsync(fileUri, csv, { encoding: FileSystem.EncodingType.UTF8 });
      await Sharing.shareAsync(fileUri, { mimeType: "text/csv", dialogTitle: "Esporta Report MAG.NA" });
    } catch {
      Alert.alert("Errore", "Impossibile esportare il file CSV.");
    }
  }, [sessions, paccoHeight]);

  const value: AppContextType = {
    mode, setMode,
    activeTab, setActiveTab,
    isRecording, recordingPhase, data, currentAngle, failFactor,
    sessions, triggerRPM, triggerProgress,
    manualRPM, setManualRPM,
    paccoHeight, setPaccoHeight,
    fetteZ, setFetteZ,
    zOffset, setZOffset,
    selected2DStep, setSelected2DStep,
    h0Slice, setH0Slice,
    h1Slice, setH1Slice,
    targetRotations, setTargetRotations,
    triggerCapRotations, setTriggerCapRotations,
    liveRPM,
    useAutoTrigger, setUseAutoTrigger: handleSetUseAutoTrigger,
    cameraEstimatedRPM,
    receiveCameraPulse,
    simDefectEnabled, setSimDefectEnabled,
    defectAngle, setDefectAngle,
    defectWidth, setDefectWidth,
    defectDepth, setDefectDepth,
    showFluxLines, setShowFluxLines,
    show2DFluxLines, setShow2DFluxLines,
    femGain, setFemGain,
    showAxisX, setShowAxisX,
    showAxisY, setShowAxisY,
    showAxisZ, setShowAxisZ,
    showResultant, setShowResultant,
    rotX, setRotX,
    rotY, setRotY,
    zoomScale, setZoomScale,
    hiddenZSlices, toggleZSliceVisibility,
    activeSteps,
    MAX_FLUX,
    handleStart, handleStop, handleReset, clearHistory, exportToCSV,
    setFailPressed,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
