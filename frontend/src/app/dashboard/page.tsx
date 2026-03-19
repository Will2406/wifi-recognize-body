"use client";

import { useESP32Status } from "@/hooks/useESP32Status";
import { useCSIData, useCSIDataRaw } from "@/hooks/useCSIData";
import { MetricsPanel } from "@/components/dashboard/MetricsPanel";
import { CSIChart } from "@/components/dashboard/CSIChart";
import { StatusBadge } from "@/components/wifi/StatusBadge";
import Link from "next/link";

export default function DashboardPage() {
  const { status, connected, lastUpdated } = useESP32Status();
  const { packetsPerSecond, isReceiving } = useCSIData();
  const { subscribe } = useCSIDataRaw();

  const wifiState = status.wifi_connected
    ? "connected"
    : status.serial_connected
      ? "connecting"
      : "disconnected";

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 py-6 space-y-6">
      {/* Connection warning banner */}
      {!connected && (
        <div className="flex items-center gap-2 rounded-lg bg-amber-500/10 border border-amber-500/20 px-4 py-3">
          <svg
            className="h-4 w-4 text-warning shrink-0"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
            />
          </svg>
          <p className="text-sm text-warning">
            Connecting to backend server...
          </p>
        </div>
      )}

      {/* Page title */}
      <div>
        <h2 className="text-xl font-bold text-text-primary">Overview</h2>
        <p className="text-sm text-text-secondary mt-0.5">
          Real-time CSI monitoring dashboard
        </p>
      </div>

      {/* Metrics row */}
      <MetricsPanel
        status={status}
        packetsPerSecond={packetsPerSecond}
        isReceiving={isReceiving}
        connected={connected}
      />

      {/* Middle: CSI amplitude chart */}
      <div className="rounded-xl border border-border/50 bg-bg-surface/30 p-5 backdrop-blur-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-text-primary">
              CSI Amplitude Spectrum
            </h3>
            <p className="text-xs text-text-secondary mt-0.5">
              Current subcarrier amplitudes (real-time)
            </p>
          </div>
          <Link
            href="/dashboard/csi"
            className="flex items-center gap-1.5 text-xs text-accent hover:text-accent-hover transition-colors"
          >
            View full monitor
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
                d="M9 5l7 7-7 7"
              />
            </svg>
          </Link>
        </div>
        <CSIChart subscribe={subscribe} height={260} />
      </div>

      {/* Bottom row: Connection info + Quick actions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Connection info card */}
        <div className="rounded-xl border border-border/50 bg-bg-surface/30 p-5 backdrop-blur-sm">
          <h3 className="text-sm font-semibold text-text-primary mb-4">
            Connection Details
          </h3>
          <div className="space-y-3">
            <InfoRow label="Serial Port">
              <StatusBadge
                state={status.serial_connected ? "connected" : "disconnected"}
                size="sm"
              />
            </InfoRow>
            <InfoRow label="WiFi Network">
              <div className="flex items-center gap-2">
                <StatusBadge state={wifiState} label={status.ssid || "None"} size="sm" />
              </div>
            </InfoRow>
            <InfoRow label="IP Address">
              <span className="text-sm font-mono text-text-primary">
                {status.ip || "--"}
              </span>
            </InfoRow>
            <InfoRow label="CSI Collection">
              <span
                className={`text-sm font-medium ${
                  status.csi_active ? "text-success" : "text-text-secondary"
                }`}
              >
                {status.csi_active ? "Active" : "Inactive"}
              </span>
            </InfoRow>
            {lastUpdated && (
              <InfoRow label="Last Update">
                <span className="text-sm font-mono text-text-secondary">
                  {lastUpdated.toLocaleTimeString()}
                </span>
              </InfoRow>
            )}
          </div>
        </div>

        {/* Quick Actions card */}
        <div className="rounded-xl border border-border/50 bg-bg-surface/30 p-5 backdrop-blur-sm">
          <h3 className="text-sm font-semibold text-text-primary mb-4">
            Quick Actions
          </h3>
          <div className="space-y-2.5">
            <QuickActionLink
              href="/dashboard/csi"
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
                    d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                  />
                </svg>
              }
              title="Open CSI Monitor"
              description="View spectrogram, time series, and detailed charts"
            />
            <QuickActionLink
              href="/dashboard/settings"
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
                    d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                </svg>
              }
              title="Configure Settings"
              description="WiFi, detection thresholds, and device info"
            />
            <QuickActionLink
              href="/setup"
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
              title="Change WiFi Network"
              description="Scan and connect to a different 2.4GHz network"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Helpers ---

function InfoRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-text-secondary">{label}</span>
      {children}
    </div>
  );
}

function QuickActionLink({
  href,
  icon,
  title,
  description,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-lg border border-border/30 bg-bg-primary/30 p-3 transition-all hover:border-accent/30 hover:bg-accent/5"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-bg-surface/50 text-text-secondary group-hover:text-accent transition-colors">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-sm font-medium text-text-primary group-hover:text-accent transition-colors">
          {title}
        </p>
        <p className="text-xs text-text-secondary truncate">{description}</p>
      </div>
      <svg
        className="h-4 w-4 shrink-0 text-text-secondary/50 group-hover:text-accent transition-colors ml-auto"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M9 5l7 7-7 7"
        />
      </svg>
    </Link>
  );
}
