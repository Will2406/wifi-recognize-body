"use client";

import type { WiFiNetwork } from "@/lib/types";
import { SignalBars } from "./SignalBars";

interface NetworkListProps {
  networks: WiFiNetwork[];
  selectedSSID: string | null;
  onSelect: (network: WiFiNetwork) => void;
  loading: boolean;
}

function NetworkSkeleton() {
  return (
    <div className="space-y-3">
      {[...Array(5)].map((_, i) => (
        <div
          key={i}
          className="flex items-center justify-between rounded-xl border border-slate-700/50 bg-bg-surface/50 p-4 animate-pulse"
        >
          <div className="flex items-center gap-3">
            <div className="h-[23px] w-[22px] rounded bg-slate-700" />
            <div>
              <div className="h-4 w-32 rounded bg-slate-700 mb-2" />
              <div className="h-3 w-20 rounded bg-slate-700" />
            </div>
          </div>
          <div className="h-5 w-12 rounded bg-slate-700" />
        </div>
      ))}
    </div>
  );
}

export function NetworkList({
  networks,
  selectedSSID,
  onSelect,
  loading,
}: NetworkListProps) {
  if (loading) {
    return <NetworkSkeleton />;
  }

  if (networks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="mb-4 rounded-full bg-slate-800 p-4">
          <svg
            className="h-8 w-8 text-text-secondary"
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
        </div>
        <p className="text-text-secondary text-sm">
          No networks found. Make sure the ESP32 is connected and try scanning
          again.
        </p>
      </div>
    );
  }

  // Sort networks by signal strength (strongest first)
  const sortedNetworks = [...networks].sort((a, b) => b.rssi - a.rssi);

  return (
    <div className="space-y-2">
      {sortedNetworks.map((network) => {
        const isSelected = selectedSSID === network.ssid;

        return (
          <button
            key={`${network.ssid}-${network.mac}`}
            onClick={() => onSelect(network)}
            className={`group flex w-full items-center justify-between rounded-xl border p-4 text-left transition-all duration-200 cursor-pointer ${
              isSelected
                ? "border-accent bg-accent/10 shadow-lg shadow-accent/5"
                : "border-slate-700/50 bg-bg-surface/50 hover:border-slate-600/80 hover:bg-bg-surface/80"
            }`}
          >
            <div className="flex items-center gap-3 min-w-0">
              <SignalBars rssi={network.rssi} />
              <div className="min-w-0">
                <p
                  className={`font-medium truncate ${
                    isSelected ? "text-accent" : "text-text-primary"
                  }`}
                >
                  {network.ssid || "(Hidden Network)"}
                </p>
                <p className="text-xs text-text-secondary mt-0.5">
                  {network.mac}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 shrink-0 ml-3">
              <span className="text-xs text-text-secondary tabular-nums">
                {network.rssi} dBm
              </span>
              <span className="inline-flex items-center rounded-md bg-slate-700/50 px-2 py-0.5 text-xs font-medium text-text-secondary">
                CH {network.channel}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
