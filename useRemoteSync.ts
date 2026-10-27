import { useCallback, useEffect, useRef, useState } from "react";

const WINDOWS_PER_REV = 8;

interface UseRemoteSyncOptions {
  enabled: boolean;
  wsUrl: string;
  onPulse: (ts: number, idx: number) => void;
  onZero?: (ts: number) => void;
}

export function useRemoteSync({
  enabled,
  wsUrl,
  onPulse,
  onZero,
}: UseRemoteSyncOptions) {
  const [connected, setConnected] = useState(false);
  const [encodersOnline, setEncodersOnline] = useState(0);
  const [pulseCount, setPulseCount] = useState(0);
  const [estimatedRPM, setEstimatedRPM] = useState<number | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const pulseTsArr = useRef<number[]>([]);
  const pulseCountRef = useRef(0);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearReconnect = useCallback(() => {
    if (reconnectRef.current) {
      clearTimeout(reconnectRef.current);
      reconnectRef.current = null;
    }
  }, []);

  const disconnect = useCallback(() => {
    clearReconnect();
    if (wsRef.current) {
      const ws = wsRef.current;
      ws.onclose = null;
      ws.close();
      wsRef.current = null;
    }
    setConnected(false);
  }, [clearReconnect]);

  const connect = useCallback(() => {
    if (!enabled || !wsUrl) return;
    disconnect();

    try {
      const ws = new WebSocket(`${wsUrl}?role=magna`);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        setLastError(null);
      };

      ws.onerror = () => {
        setLastError("Errore connessione WebSocket");
      };

      ws.onclose = () => {
        wsRef.current = null;
        setConnected(false);
        if (enabled) {
          reconnectRef.current = setTimeout(connect, 2500);
        }
      };

      ws.onmessage = (event: MessageEvent) => {
        try {
          const msg = JSON.parse(event.data as string) as Record<string, unknown>;

          if (msg.type === "pulse") {
            const ts = Number(msg.ts ?? Date.now());
            pulseTsArr.current.push(ts);
            pulseCountRef.current += 1;
            const count = pulseCountRef.current;
            setPulseCount(count);

            // Compute RPM from recent inter-pulse intervals
            const arr = pulseTsArr.current;
            if (arr.length >= 2) {
              const recent = arr.slice(Math.max(0, arr.length - WINDOWS_PER_REV));
              const intervals: number[] = [];
              for (let i = 1; i < recent.length; i++) {
                intervals.push(recent[i] - recent[i - 1]);
              }
              const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
              if (avg > 0) {
                setEstimatedRPM(
                  Math.max(0.01, Math.min(999, 60000 / (WINDOWS_PER_REV * avg)))
                );
              }
            }

            onPulse(ts, count);
          } else if (msg.type === "zero") {
            onZero?.(Number(msg.ts ?? Date.now()));
          } else if (msg.type === "status") {
            setEncodersOnline(Number(msg.encoders ?? 0));
          }
        } catch {
          // ignore malformed messages
        }
      };
    } catch {
      setLastError("URL WebSocket non valido");
    }
  }, [enabled, wsUrl, onPulse, onZero, disconnect]);

  useEffect(() => {
    if (enabled) {
      connect();
    } else {
      disconnect();
    }
    return () => disconnect();
  }, [enabled, connect, disconnect]);

  const reset = useCallback(() => {
    pulseTsArr.current = [];
    pulseCountRef.current = 0;
    setPulseCount(0);
    setEstimatedRPM(null);
  }, []);

  return {
    connected,
    encodersOnline,
    pulseCount,
    estimatedRPM,
    lastError,
    reset,
  };
}
