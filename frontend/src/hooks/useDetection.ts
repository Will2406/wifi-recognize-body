'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSocket } from '@/components/providers/SocketProvider';
import type { DetectionResult } from '@/lib/types';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface DetectionState {
  presence: boolean;
  movement: number;
  movementLabel: 'quiet' | 'light' | 'strong';
  varianceRatio: number;
  calibrating: boolean;
  calibrated: boolean;
  timestamp: number;
}

const DEFAULT_STATE: DetectionState = {
  presence: false,
  movement: 0,
  movementLabel: 'quiet',
  varianceRatio: 0,
  calibrating: false,
  calibrated: false,
  timestamp: 0,
};

export function useDetection() {
  const { socket, connected } = useSocket();
  const [detection, setDetection] = useState<DetectionState>(DEFAULT_STATE);
  const latestRef = useRef<DetectionState>(DEFAULT_STATE);
  const updateTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Fetch initial calibration state from REST API
  useEffect(() => {
    if (!connected) return;

    const fetchState = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/detection`);
        if (res.ok) {
          const data = await res.json();
          const state: DetectionState = {
            presence: data.presence ?? false,
            movement: data.movement ?? 0,
            movementLabel: data.movement_label ?? 'quiet',
            varianceRatio: data.variance_ratio ?? 0,
            calibrating: data.calibrating ?? false,
            calibrated: data.calibrated ?? false,
            timestamp: Date.now(),
          };
          latestRef.current = state;
          setDetection(state);
        }
      } catch {
        // Backend not reachable yet, will get data via socket
      }
    };

    fetchState();
  }, [connected]);

  // Subscribe to detection_result socket events
  useEffect(() => {
    if (!socket || !connected) return;

    const handleDetection = (data: DetectionResult & { calibrating?: boolean; calibrated?: boolean }) => {
      const state: DetectionState = {
        presence: data.presence,
        movement: data.movement,
        movementLabel: data.movement_label,
        varianceRatio: data.variance_ratio,
        calibrating: data.calibrating ?? latestRef.current.calibrating,
        calibrated: data.calibrated ?? latestRef.current.calibrated,
        timestamp: data.timestamp,
      };
      latestRef.current = state;
    };

    socket.on('detection_result', handleDetection);

    // Throttled state updates at ~10fps to avoid excessive re-renders
    updateTimerRef.current = setInterval(() => {
      setDetection(latestRef.current);
    }, 100);

    return () => {
      socket.off('detection_result', handleDetection);
      if (updateTimerRef.current) {
        clearInterval(updateTimerRef.current);
        updateTimerRef.current = null;
      }
    };
  }, [socket, connected]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (updateTimerRef.current) {
        clearInterval(updateTimerRef.current);
        updateTimerRef.current = null;
      }
    };
  }, []);

  // Calibration trigger via REST
  const startCalibration = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/calibrate`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        latestRef.current = {
          ...latestRef.current,
          calibrating: true,
          calibrated: false,
        };
        setDetection(latestRef.current);
        return { success: true, seconds: data.seconds as number };
      }
      return { success: false, seconds: 0 };
    } catch {
      return { success: false, seconds: 0 };
    }
  }, []);

  return {
    ...detection,
    startCalibration,
  };
}
