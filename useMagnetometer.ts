import { useEffect, useRef } from "react";
import { Platform } from "react-native";

export type MagData = { x: number; y: number; z: number };

export function useMagnetometer(
  active: boolean,
  onData: (data: MagData) => void
) {
  const subscriptionRef = useRef<{ remove: () => void } | null>(null);
  const onDataRef = useRef(onData);
  onDataRef.current = onData;

  useEffect(() => {
    if (!active || Platform.OS === "web") return;

    let Magnetometer: {
      setUpdateInterval: (ms: number) => void;
      addListener: (cb: (data: MagData) => void) => { remove: () => void };
    } | null = null;

    try {
      Magnetometer = require("expo-sensors").Magnetometer;
    } catch {
      return;
    }

    if (!Magnetometer) return;

    Magnetometer.setUpdateInterval(16);
    subscriptionRef.current = Magnetometer.addListener((data) => {
      onDataRef.current(data);
    });

    return () => {
      subscriptionRef.current?.remove();
      subscriptionRef.current = null;
    };
  }, [active]);
}
