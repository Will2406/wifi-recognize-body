"use client";

import { useState } from "react";
import { useESP32Status } from "@/hooks/useESP32Status";
import { useCSIData, useCSIDataRaw } from "@/hooks/useCSIData";
import { CSIChart } from "@/components/dashboard/CSIChart";
import { SpectrogramView } from "@/components/dashboard/SpectrogramView";
import { TimeSeriesChart } from "@/components/dashboard/TimeSeriesChart";
import { MetricsPanel } from "@/components/dashboard/MetricsPanel";

type ViewTab = "all" | "spectrum" | "spectrogram" | "timeseries";

export default function CSIMonitorPage() {
  const { status, connected } = useESP32Status();
  const { packetsPerSecond, isReceiving, latestCSI } = useCSIData();
  const { subscribe } = useCSIDataRaw();
  const [activeTab, setActiveTab] = useState<ViewTab>("all");

  const tabs: { id: ViewTab; label: string }[] = [
    { id: "all", label: "All Views" },
    { id: "spectrum", label: "Spectrum" },
    { id: "spectrogram", label: "Spectrogram" },
    { id: "timeseries", label: "Time Series" },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-text-primary">CSI Monitor</h2>
          <p className="text-sm text-text-secondary mt-0.5">
            Real-time Channel State Information visualization
          </p>
        </div>

        {/* Live indicator */}
        <div className="flex items-center gap-3">
          {isReceiving && (
            <div className="flex items-center gap-2 rounded-full border border-success/30 bg-success/10 px-3 py-1.5">
              <div className="h-2 w-2 rounded-full bg-success animate-pulse" />
              <span className="text-xs font-medium text-success">
                LIVE &mdash; {packetsPerSecond} pkt/s
              </span>
            </div>
          )}
          {latestCSI && (
            <div className="text-xs text-text-secondary font-mono">
              {latestCSI.num_subcarriers} subcarriers
            </div>
          )}
        </div>
      </div>

      {/* Metrics */}
      <MetricsPanel
        status={status}
        packetsPerSecond={packetsPerSecond}
        isReceiving={isReceiving}
        connected={connected}
      />

      {/* View tabs */}
      <div className="flex items-center gap-1 rounded-lg bg-bg-surface/30 border border-border/30 p-1 w-fit">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              activeTab === tab.id
                ? "bg-accent/15 text-accent"
                : "text-text-secondary hover:text-text-primary"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Chart panels */}
      <div className="space-y-5">
        {/* Spectrogram — the key visualization */}
        {(activeTab === "all" || activeTab === "spectrogram") && (
          <ChartPanel
            title="Spectrogram"
            subtitle="Time-frequency heatmap — colors represent CSI amplitude intensity. Movement appears as color changes over time."
          >
            <SpectrogramView
              subscribe={subscribe}
              timeColumns={500}
              height={350}
            />
          </ChartPanel>
        )}

        {/* Amplitude spectrum */}
        {(activeTab === "all" || activeTab === "spectrum") && (
          <ChartPanel
            title="Amplitude Spectrum"
            subtitle="Current subcarrier amplitudes — each bar represents one subcarrier's signal strength."
          >
            <CSIChart subscribe={subscribe} height={280} />
          </ChartPanel>
        )}

        {/* Time series */}
        {(activeTab === "all" || activeTab === "timeseries") && (
          <ChartPanel
            title="Time Series"
            subtitle="Top subcarriers by variance — these channels are most sensitive to environmental changes."
          >
            <TimeSeriesChart
              subscribe={subscribe}
              numTracked={8}
              windowSize={400}
              height={280}
            />
          </ChartPanel>
        )}
      </div>

      {/* Raw data info */}
      {latestCSI && (
        <div className="rounded-xl border border-border/50 bg-bg-surface/30 p-5 backdrop-blur-sm">
          <h3 className="text-sm font-semibold text-text-primary mb-3">
            Latest Packet Info
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <DataPoint label="Source MAC" value={latestCSI.mac_src} mono />
            <DataPoint
              label="RSSI"
              value={`${latestCSI.rssi} dBm`}
              mono
            />
            <DataPoint
              label="Channel"
              value={String(latestCSI.channel)}
              mono
            />
            <DataPoint
              label="Timestamp"
              value={new Date(latestCSI.timestamp * 1000).toLocaleTimeString()}
              mono
            />
          </div>
        </div>
      )}
    </div>
  );
}

// --- Helpers ---

function ChartPanel({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border/50 bg-bg-surface/30 p-5 backdrop-blur-sm">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
        <p className="text-xs text-text-secondary mt-0.5">{subtitle}</p>
      </div>
      {children}
    </div>
  );
}

function DataPoint({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-text-secondary mb-0.5">
        {label}
      </p>
      <p
        className={`text-sm text-text-primary ${
          mono ? "font-mono" : ""
        }`}
      >
        {value}
      </p>
    </div>
  );
}
