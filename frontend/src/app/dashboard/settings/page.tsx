"use client";

import { useState } from "react";
import { useESP32Status } from "@/hooks/useESP32Status";
import { useSocket } from "@/components/providers/SocketProvider";
import { StatusBadge } from "@/components/wifi/StatusBadge";
import { SignalBars } from "@/components/wifi/SignalBars";
import Link from "next/link";

export default function SettingsPage() {
  const { status, connected } = useESP32Status();
  const { socket } = useSocket();

  // Room settings (local state for now)
  const [roomWidth, setRoomWidth] = useState("5.0");
  const [roomHeight, setRoomHeight] = useState("4.0");

  // Detection settings
  const [presenceThreshold, setPresenceThreshold] = useState(0.5);

  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 py-6 space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-text-primary">Settings</h2>
        <p className="text-sm text-text-secondary mt-0.5">
          Configure WiFi, detection, and device settings
        </p>
      </div>

      {/* WiFi Section */}
      <SettingsSection
        title="WiFi Network"
        icon={
          <svg
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.14 0M1.394 9.393c5.857-5.858 15.355-5.858 21.213 0"
            />
          </svg>
        }
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {status.rssi !== null && (
                <SignalBars rssi={status.rssi} size="sm" />
              )}
              <div>
                <p className="text-sm font-medium text-text-primary">
                  {status.ssid || "Not connected"}
                </p>
                <p className="text-xs text-text-secondary">
                  {status.ip ? `IP: ${status.ip}` : "No IP assigned"}
                  {status.channel ? ` | Channel ${status.channel}` : ""}
                </p>
              </div>
            </div>
            <StatusBadge
              state={status.wifi_connected ? "connected" : "disconnected"}
              size="sm"
            />
          </div>

          {status.rssi !== null && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-text-secondary">Signal Strength</span>
              <span className="font-mono text-text-primary">
                {status.rssi} dBm
              </span>
            </div>
          )}

          <div className="pt-2 border-t border-border/30">
            <Link
              href="/setup"
              className="flex items-center justify-center gap-2 rounded-lg border border-border/50 bg-bg-primary/50 px-4 py-2.5 text-sm text-text-secondary hover:text-text-primary hover:border-accent/30 transition-all"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              Change WiFi Network
            </Link>
          </div>
        </div>
      </SettingsSection>

      {/* Room Configuration Section */}
      <SettingsSection
        title="Room Configuration"
        icon={
          <svg
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
            />
          </svg>
        }
      >
        <div className="space-y-4">
          <p className="text-xs text-text-secondary">
            Room dimensions are used for the spatial presence map (future
            feature).
          </p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-text-secondary mb-1.5">
                Width (meters)
              </label>
              <input
                type="number"
                step="0.1"
                min="0.5"
                max="50"
                value={roomWidth}
                onChange={(e) => setRoomWidth(e.target.value)}
                className="w-full rounded-lg border border-slate-600/50 bg-slate-800/80 px-3 py-2 text-sm font-mono text-text-primary outline-none focus:border-accent focus:ring-1 focus:ring-accent/50"
              />
            </div>
            <div>
              <label className="block text-xs text-text-secondary mb-1.5">
                Height (meters)
              </label>
              <input
                type="number"
                step="0.1"
                min="0.5"
                max="50"
                value={roomHeight}
                onChange={(e) => setRoomHeight(e.target.value)}
                className="w-full rounded-lg border border-slate-600/50 bg-slate-800/80 px-3 py-2 text-sm font-mono text-text-primary outline-none focus:border-accent focus:ring-1 focus:ring-accent/50"
              />
            </div>
          </div>
          {/* Room preview */}
          <div className="flex items-center justify-center">
            <div
              className="border border-dashed border-slate-600/50 rounded-lg relative flex items-center justify-center"
              style={{
                width: `${Math.min(Number(roomWidth) * 30, 250)}px`,
                height: `${Math.min(Number(roomHeight) * 30, 200)}px`,
                minWidth: "80px",
                minHeight: "60px",
              }}
            >
              <span className="text-[10px] text-text-secondary">
                {roomWidth}m x {roomHeight}m
              </span>
            </div>
          </div>
        </div>
      </SettingsSection>

      {/* Detection Section */}
      <SettingsSection
        title="Presence Detection"
        icon={
          <svg
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
            />
          </svg>
        }
      >
        <div className="space-y-5">
          {/* Threshold slider */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs text-text-secondary">
                Presence Threshold
              </label>
              <span className="text-xs font-mono text-text-primary">
                {presenceThreshold.toFixed(2)}
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={presenceThreshold}
              onChange={(e) =>
                setPresenceThreshold(parseFloat(e.target.value))
              }
              className="w-full h-2 bg-slate-700 rounded-full appearance-none cursor-pointer accent-accent"
            />
            <div className="flex justify-between mt-1">
              <span className="text-[10px] text-text-secondary">
                Sensitive
              </span>
              <span className="text-[10px] text-text-secondary">
                Conservative
              </span>
            </div>
          </div>

          {/* Calibration */}
          <div className="pt-2 border-t border-border/30">
            <button
              onClick={() => {
                if (socket && connected) {
                  socket.emit("calibrate");
                }
              }}
              disabled={!connected || !status.csi_active}
              className="flex items-center justify-center gap-2 w-full rounded-lg border border-border/50 bg-bg-primary/50 px-4 py-2.5 text-sm text-text-secondary hover:text-text-primary hover:border-accent/30 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              Run Calibration
            </button>
            <p className="text-[10px] text-text-secondary mt-2 text-center">
              Captures baseline CSI while room is empty. Ensure no movement
              during calibration.
            </p>
          </div>
        </div>
      </SettingsSection>

      {/* Serial Connection Section */}
      <SettingsSection
        title="Serial Connection"
        icon={
          <svg
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
            />
          </svg>
        }
      >
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-text-secondary">Status</span>
            <StatusBadge
              state={status.serial_connected ? "connected" : "disconnected"}
              size="sm"
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-text-secondary">Backend</span>
            <StatusBadge
              state={connected ? "connected" : "disconnected"}
              label={connected ? "Online" : "Offline"}
              size="sm"
            />
          </div>
        </div>
      </SettingsSection>

      {/* About Section */}
      <SettingsSection
        title="About"
        icon={
          <svg
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        }
      >
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-text-secondary">Application</span>
            <span className="text-sm text-text-primary">WiFi Sense Lab</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-text-secondary">Version</span>
            <span className="text-sm font-mono text-text-primary">0.1.0</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-text-secondary">ESP32 Chip</span>
            <span className="text-sm font-mono text-text-primary">
              ESP32-S3
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-text-secondary">Free Heap</span>
            <span className="text-sm font-mono text-text-primary">
              {status.free_heap > 0
                ? `${(status.free_heap / 1024).toFixed(1)} KB`
                : "--"}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-text-secondary">CSI Active</span>
            <span
              className={`text-sm font-medium ${
                status.csi_active ? "text-success" : "text-text-secondary"
              }`}
            >
              {status.csi_active ? "Yes" : "No"}
            </span>
          </div>
        </div>
      </SettingsSection>
    </div>
  );
}

// --- Settings Section wrapper ---

function SettingsSection({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border/50 bg-bg-surface/30 backdrop-blur-sm overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-3.5 border-b border-border/30 bg-bg-surface/20">
        <div className="text-text-secondary">{icon}</div>
        <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}
