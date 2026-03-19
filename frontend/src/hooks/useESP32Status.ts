"use client";

import { useEffect, useState, useCallback } from "react";
import type { ESP32Status } from "@/lib/types";
import { useSocket } from "@/components/providers/SocketProvider";

const DEFAULT_STATUS: ESP32Status = {
  serial_connected: false,
  wifi_connected: false,
  ssid: null,
  ip: null,
  rssi: null,
  channel: null,
  csi_active: false,
  packets_per_second: 0,
  free_heap: 0,
};

export function useESP32Status() {
  const { socket, connected } = useSocket();
  const [status, setStatus] = useState<ESP32Status>(DEFAULT_STATUS);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  useEffect(() => {
    if (!socket || !connected) return;

    const handleStatus = (data: ESP32Status) => {
      setStatus(data);
      setLastUpdated(new Date());
    };

    socket.on("esp32_status", handleStatus);

    return () => {
      socket.off("esp32_status", handleStatus);
    };
  }, [socket, connected]);

  const refresh = useCallback(() => {
    if (socket && connected) {
      socket.emit("request_status");
    }
  }, [socket, connected]);

  return {
    status,
    lastUpdated,
    connected,
    refresh,
  };
}
