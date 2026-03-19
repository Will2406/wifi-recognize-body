"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useSocket } from "@/components/providers/SocketProvider";
import type { CSIData } from "@/lib/types";

const MAX_HISTORY = 500; // ~10 seconds at 50 pps
const PPS_WINDOW_MS = 2000; // rolling average window
const RECEIVE_TIMEOUT_MS = 2000; // consider "not receiving" after 2s of silence

interface UseCSIDataReturn {
  latestCSI: CSIData | null;
  history: CSIData[];
  packetsPerSecond: number;
  isReceiving: boolean;
}

export function useCSIData(): UseCSIDataReturn {
  const { socket, connected } = useSocket();

  // Use refs for high-frequency data to avoid re-rendering on every packet
  const historyRef = useRef<CSIData[]>([]);
  const timestampsRef = useRef<number[]>([]); // for PPS calculation
  const latestRef = useRef<CSIData | null>(null);
  const lastReceivedRef = useRef<number>(0);

  // State updated at a lower frequency for React consumption
  const [latestCSI, setLatestCSI] = useState<CSIData | null>(null);
  const [history, setHistory] = useState<CSIData[]>([]);
  const [packetsPerSecond, setPacketsPerSecond] = useState(0);
  const [isReceiving, setIsReceiving] = useState(false);

  // Throttled state updater — updates React state at ~15fps max
  const updateTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startUpdater = useCallback(() => {
    if (updateTimerRef.current) return;
    updateTimerRef.current = setInterval(() => {
      const now = Date.now();

      // Update latest CSI
      setLatestCSI(latestRef.current);

      // Update history (snapshot of ref)
      setHistory([...historyRef.current]);

      // Calculate packets per second from timestamps within the window
      const cutoff = now - PPS_WINDOW_MS;
      timestampsRef.current = timestampsRef.current.filter((t) => t > cutoff);
      const pps = timestampsRef.current.length / (PPS_WINDOW_MS / 1000);
      setPacketsPerSecond(Math.round(pps));

      // Check if still receiving
      const receiving = now - lastReceivedRef.current < RECEIVE_TIMEOUT_MS;
      setIsReceiving(receiving);
    }, 66); // ~15 fps state updates
  }, []);

  const stopUpdater = useCallback(() => {
    if (updateTimerRef.current) {
      clearInterval(updateTimerRef.current);
      updateTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!socket || !connected) return;

    const handleCSI = (data: CSIData) => {
      const now = Date.now();

      // Update refs (no React re-render)
      latestRef.current = data;
      lastReceivedRef.current = now;
      timestampsRef.current.push(now);

      // Circular buffer for history
      historyRef.current.push(data);
      if (historyRef.current.length > MAX_HISTORY) {
        historyRef.current = historyRef.current.slice(-MAX_HISTORY);
      }
    };

    socket.on("csi_data", handleCSI);
    startUpdater();

    return () => {
      socket.off("csi_data", handleCSI);
      stopUpdater();
    };
  }, [socket, connected, startUpdater, stopUpdater]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopUpdater();
    };
  }, [stopUpdater]);

  return {
    latestCSI,
    history,
    packetsPerSecond,
    isReceiving,
  };
}

/**
 * Raw ref-based access for Canvas components that need every packet
 * without causing React re-renders.
 */
export function useCSIDataRaw() {
  const { socket, connected } = useSocket();
  const historyRef = useRef<CSIData[]>([]);
  const latestRef = useRef<CSIData | null>(null);
  const timestampsRef = useRef<number[]>([]);
  const lastReceivedRef = useRef<number>(0);
  const subscribersRef = useRef<Set<(data: CSIData) => void>>(new Set());

  const subscribe = useCallback((cb: (data: CSIData) => void) => {
    subscribersRef.current.add(cb);
    return () => {
      subscribersRef.current.delete(cb);
    };
  }, []);

  useEffect(() => {
    if (!socket || !connected) return;

    const handleCSI = (data: CSIData) => {
      const now = Date.now();
      latestRef.current = data;
      lastReceivedRef.current = now;
      timestampsRef.current.push(now);

      // Trim old timestamps
      const cutoff = now - 2000;
      if (timestampsRef.current.length > 200) {
        timestampsRef.current = timestampsRef.current.filter((t) => t > cutoff);
      }

      // Circular buffer
      historyRef.current.push(data);
      if (historyRef.current.length > MAX_HISTORY) {
        historyRef.current = historyRef.current.slice(-MAX_HISTORY);
      }

      // Notify raw subscribers
      subscribersRef.current.forEach((cb) => cb(data));
    };

    socket.on("csi_data", handleCSI);
    return () => {
      socket.off("csi_data", handleCSI);
    };
  }, [socket, connected]);

  return {
    historyRef,
    latestRef,
    timestampsRef,
    lastReceivedRef,
    subscribe,
  };
}
