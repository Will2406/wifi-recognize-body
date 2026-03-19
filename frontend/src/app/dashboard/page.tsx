"use client";

import { useESP32Status } from "@/hooks/useESP32Status";

export default function DashboardPage() {
  const { status, connected } = useESP32Status();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-bg-primary">
      <div className="text-center">
        <div className="mb-6 flex h-16 w-16 mx-auto items-center justify-center rounded-2xl bg-accent/20 border border-accent/30">
          <svg
            className="h-8 w-8 text-accent"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
            />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-text-primary mb-2">
          Dashboard
        </h1>
        <p className="text-text-secondary mb-8">
          WiFi Sense Lab &mdash; CSI Monitoring
        </p>

        {/* Status card */}
        <div className="mx-auto max-w-sm rounded-xl border border-slate-700/50 bg-bg-surface/50 p-6 backdrop-blur-sm">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-text-secondary">WebSocket</span>
              <div className="flex items-center gap-1.5">
                <div
                  className={`h-2 w-2 rounded-full ${
                    connected ? "bg-success" : "bg-error"
                  }`}
                />
                <span className="text-sm text-text-primary">
                  {connected ? "Connected" : "Disconnected"}
                </span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-text-secondary">WiFi</span>
              <span className="text-sm text-text-primary">
                {status.ssid || "Not connected"}
              </span>
            </div>
            {status.ip && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-text-secondary">IP</span>
                <span className="text-sm font-mono text-text-primary">
                  {status.ip}
                </span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-sm text-text-secondary">CSI Active</span>
              <span className="text-sm text-text-primary">
                {status.csi_active ? "Yes" : "No"}
              </span>
            </div>
          </div>
        </div>

        <p className="mt-8 text-xs text-text-secondary">
          Full dashboard will be implemented in Phase D.
        </p>
      </div>
    </div>
  );
}
