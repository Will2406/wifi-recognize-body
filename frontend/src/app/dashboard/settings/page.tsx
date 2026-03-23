"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useESP32Status } from "@/hooks/useESP32Status";
import { useDetection } from "@/hooks/useDetection";
import { StatusBadge } from "@/components/wifi/StatusBadge";
import { SignalBars } from "@/components/wifi/SignalBars";
import Link from "next/link";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function SettingsPage() {
  const { status, connected } = useESP32Status();
  const {
    calibrated,
    calibrating,
    startCalibration,
  } = useDetection();

  // Room settings (local state for now)
  const [roomWidth, setRoomWidth] = useState("5.0");
  const [roomHeight, setRoomHeight] = useState("4.0");

  // Detection settings
  const [presenceThreshold, setPresenceThreshold] = useState(3.0);

  // Calibration state
  const [calibrateStatus, setCalibrateStatus] = useState<
    "idle" | "calibrating" | "done" | "error"
  >("idle");
  const [calibrateSeconds, setCalibrateSeconds] = useState(0);
  const [calibrateCountdown, setCalibrateCountdown] = useState(0);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Sync calibration status from detection hook
  useEffect(() => {
    if (calibrated && calibrateStatus === "calibrating") {
      setCalibrateStatus("done");
      setCalibrateCountdown(0);
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
        countdownRef.current = null;
      }
    }
  }, [calibrated, calibrateStatus]);

  const handleCalibrate = useCallback(async () => {
    setCalibrateStatus("calibrating");
    try {
      const result = await startCalibration();
      if (result.success) {
        const totalSeconds = result.seconds;
        setCalibrateSeconds(totalSeconds);
        setCalibrateCountdown(totalSeconds);

        // Start countdown
        if (countdownRef.current) clearInterval(countdownRef.current);
        const startTime = Date.now();
        countdownRef.current = setInterval(() => {
          const elapsed = (Date.now() - startTime) / 1000;
          const remaining = Math.max(0, totalSeconds - elapsed);
          setCalibrateCountdown(Math.ceil(remaining));
          if (remaining <= 0) {
            if (countdownRef.current) {
              clearInterval(countdownRef.current);
              countdownRef.current = null;
            }
            // The actual completion will be detected via the detection hook
          }
        }, 500);
      } else {
        setCalibrateStatus("error");
      }
    } catch {
      setCalibrateStatus("error");
    }
  }, [startCalibration]);

  // Cleanup countdown on unmount
  useEffect(() => {
    return () => {
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
      }
    };
  }, []);

  // Recording state
  const [recordingLabel, setRecordingLabel] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [recordingInfo, setRecordingInfo] = useState<{
    samples: number;
    duration: number;
    file: string;
  } | null>(null);
  const recordingPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const handleStartRecording = useCallback(async () => {
    try {
      const url = new URL(`${API_BASE}/api/recording/start`);
      if (recordingLabel.trim()) {
        url.searchParams.set("label", recordingLabel.trim());
      }
      const res = await fetch(url.toString(), { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setIsRecording(true);
        setRecordingInfo({ samples: 0, duration: 0, file: data.file || "" });

        // Poll recording status
        recordingPollRef.current = setInterval(async () => {
          try {
            const statusRes = await fetch(`${API_BASE}/api/recording/status`);
            if (statusRes.ok) {
              const statusData = await statusRes.json();
              if (statusData.recording) {
                setRecordingInfo({
                  samples: statusData.samples || 0,
                  duration: statusData.duration || 0,
                  file: statusData.file || "",
                });
              } else {
                setIsRecording(false);
              }
            }
          } catch {
            // Ignore poll errors
          }
        }, 1000);
      }
    } catch {
      // Error starting recording
    }
  }, [recordingLabel]);

  const handleStopRecording = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/recording/stop`, {
        method: "POST",
      });
      if (res.ok) {
        const data = await res.json();
        setIsRecording(false);
        setRecordingInfo({
          samples: data.samples || 0,
          duration: data.duration || 0,
          file: data.file || "",
        });
      }
    } catch {
      // Error stopping recording
    }

    if (recordingPollRef.current) {
      clearInterval(recordingPollRef.current);
      recordingPollRef.current = null;
    }
  }, []);

  // Cleanup recording poll on unmount
  useEffect(() => {
    return () => {
      if (recordingPollRef.current) {
        clearInterval(recordingPollRef.current);
      }
    };
  }, []);

  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 py-6 space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-text-primary">Settings</h2>
        <p className="text-sm text-text-secondary mt-0.5">
          Configure WiFi, detection, recording, and device settings
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
                Presence Threshold (Variance Ratio)
              </label>
              <span className="text-xs font-mono text-text-primary">
                {presenceThreshold.toFixed(1)}
              </span>
            </div>
            <input
              type="range"
              min="1"
              max="10"
              step="0.1"
              value={presenceThreshold}
              onChange={(e) =>
                setPresenceThreshold(parseFloat(e.target.value))
              }
              className="w-full h-2 bg-slate-700 rounded-full appearance-none cursor-pointer accent-accent"
            />
            <div className="flex justify-between mt-1">
              <span className="text-[10px] text-text-secondary">
                Sensitive (1.0)
              </span>
              <span className="text-[10px] text-text-secondary">
                Conservative (10.0)
              </span>
            </div>
          </div>

          {/* Calibration */}
          <div className="pt-2 border-t border-border/30 space-y-3">
            {/* Calibration status */}
            {calibrateStatus === "calibrating" && (
              <div className="flex items-center gap-3 rounded-lg bg-amber-500/10 border border-amber-500/20 px-4 py-3">
                <svg
                  className="h-5 w-5 text-amber-400 animate-spin shrink-0"
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
                <div className="flex-1">
                  <p className="text-sm font-medium text-amber-400">
                    Calibrating...
                  </p>
                  <p className="text-xs text-amber-400/70">
                    {calibrateCountdown > 0
                      ? `${calibrateCountdown}s remaining -- keep room empty`
                      : "Finalizing..."}
                  </p>
                </div>
                {/* Progress bar */}
                {calibrateSeconds > 0 && (
                  <div className="w-16 h-2 rounded-full bg-amber-900/30 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-amber-400 transition-all duration-500"
                      style={{
                        width: `${Math.max(
                          0,
                          ((calibrateSeconds - calibrateCountdown) /
                            calibrateSeconds) *
                            100
                        )}%`,
                      }}
                    />
                  </div>
                )}
              </div>
            )}

            {calibrateStatus === "done" && (
              <div className="flex items-center gap-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-4 py-3">
                <svg
                  className="h-5 w-5 text-emerald-400 shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
                <div>
                  <p className="text-sm font-medium text-emerald-400">
                    Calibration Complete
                  </p>
                  <p className="text-xs text-emerald-400/70">
                    Baseline captured successfully
                  </p>
                </div>
              </div>
            )}

            {calibrateStatus === "error" && (
              <div className="flex items-center gap-3 rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3">
                <svg
                  className="h-5 w-5 text-red-400 shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
                <div>
                  <p className="text-sm font-medium text-red-400">
                    Calibration Failed
                  </p>
                  <p className="text-xs text-red-400/70">
                    Could not reach backend. Is it running?
                  </p>
                </div>
              </div>
            )}

            {/* Existing calibration indicator */}
            {calibrated && calibrateStatus === "idle" && (
              <div className="flex items-center gap-2 text-xs text-emerald-400">
                <svg
                  className="h-3.5 w-3.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
                System is calibrated
              </div>
            )}

            <button
              onClick={handleCalibrate}
              disabled={
                !connected ||
                !status.csi_active ||
                calibrateStatus === "calibrating"
              }
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
              {calibrateStatus === "calibrating"
                ? "Calibrating..."
                : "Run Calibration"}
            </button>
            <p className="text-[10px] text-text-secondary mt-2 text-center">
              Captures baseline CSI while room is empty. Ensure no movement
              during calibration.
            </p>
          </div>
        </div>
      </SettingsSection>

      {/* Recording Section */}
      <SettingsSection
        title="Data Recording"
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
              d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.25a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m0 0a2.625 2.625 0 113.75 0m-3.75 0H6.75"
            />
          </svg>
        }
      >
        <div className="space-y-4">
          <p className="text-xs text-text-secondary">
            Record CSI data to CSV for offline analysis and ML training.
          </p>

          {/* Label input */}
          <div>
            <label className="block text-xs text-text-secondary mb-1.5">
              Recording Label
            </label>
            <input
              type="text"
              placeholder="e.g. empty, walking, sitting"
              value={recordingLabel}
              onChange={(e) => setRecordingLabel(e.target.value)}
              disabled={isRecording}
              className="w-full rounded-lg border border-slate-600/50 bg-slate-800/80 px-3 py-2 text-sm font-mono text-text-primary outline-none focus:border-accent focus:ring-1 focus:ring-accent/50 disabled:opacity-50"
            />
          </div>

          {/* Recording status */}
          {isRecording && recordingInfo && (
            <div className="flex items-center gap-3 rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3">
              <div className="h-3 w-3 rounded-full bg-red-500 animate-pulse shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-red-400">Recording</p>
                <p className="text-xs text-red-400/70 truncate">
                  {recordingInfo.samples} samples |{" "}
                  {recordingInfo.duration.toFixed(1)}s
                </p>
              </div>
            </div>
          )}

          {!isRecording && recordingInfo && recordingInfo.samples > 0 && (
            <div className="flex items-center gap-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-4 py-3">
              <svg
                className="h-5 w-5 text-emerald-400 shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-emerald-400">
                  Recording Saved
                </p>
                <p className="text-xs text-emerald-400/70 truncate">
                  {recordingInfo.samples} samples |{" "}
                  {recordingInfo.duration.toFixed(1)}s
                </p>
              </div>
            </div>
          )}

          {/* Start/Stop button */}
          <button
            onClick={isRecording ? handleStopRecording : handleStartRecording}
            disabled={!connected || !status.csi_active}
            className={`flex items-center justify-center gap-2 w-full rounded-lg border px-4 py-2.5 text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
              isRecording
                ? "border-red-500/50 bg-red-500/10 text-red-400 hover:bg-red-500/20"
                : "border-border/50 bg-bg-primary/50 text-text-secondary hover:text-text-primary hover:border-accent/30"
            }`}
          >
            {isRecording ? (
              <>
                <div className="h-3 w-3 rounded-sm bg-red-400" />
                Stop Recording
              </>
            ) : (
              <>
                <div className="h-3 w-3 rounded-full bg-red-500" />
                Start Recording
              </>
            )}
          </button>
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
