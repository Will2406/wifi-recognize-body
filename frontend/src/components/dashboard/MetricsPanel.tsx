"use client";

import { useEffect, useRef, useCallback } from "react";
import type { ESP32Status } from "@/lib/types";

interface MetricsPanelProps {
  status: ESP32Status;
  packetsPerSecond: number;
  isReceiving: boolean;
  connected: boolean;
}

/**
 * Dashboard stats panel showing key metrics with mini sparklines.
 */
export function MetricsPanel({
  status,
  packetsPerSecond,
  isReceiving,
  connected,
}: MetricsPanelProps) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
      {/* Packets/sec */}
      <MetricCard
        label="Packets / sec"
        value={isReceiving ? String(packetsPerSecond) : "--"}
        icon={
          <svg
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M13 10V3L4 14h7v7l9-11h-7z"
            />
          </svg>
        }
        accent={isReceiving ? "sky" : "slate"}
        pulse={isReceiving}
      />

      {/* RSSI */}
      <MetricCard
        label="RSSI"
        value={status.rssi !== null ? `${status.rssi} dBm` : "--"}
        icon={
          <svg
            className="h-4 w-4"
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
        accent={
          status.rssi !== null
            ? status.rssi > -50
              ? "emerald"
              : status.rssi > -70
                ? "amber"
                : "red"
            : "slate"
        }
        sparkline={status.rssi !== null}
        sparklineValue={status.rssi ?? 0}
        sparklineMin={-90}
        sparklineMax={-20}
      />

      {/* Subcarriers */}
      <MetricCard
        label="Subcarriers"
        value={
          status.csi_active
            ? String(status.packets_per_second > 0 ? 56 : "--")
            : "--"
        }
        icon={
          <svg
            className="h-4 w-4"
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
        accent="purple"
      />

      {/* WiFi Channel */}
      <MetricCard
        label="WiFi Channel"
        value={status.channel !== null ? String(status.channel) : "--"}
        icon={
          <svg
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M5.636 18.364a9 9 0 010-12.728m12.728 0a9 9 0 010 12.728m-9.9-2.829a5 5 0 010-7.07m7.072 0a5 5 0 010 7.07M13 12a1 1 0 11-2 0 1 1 0 012 0z"
            />
          </svg>
        }
        accent="cyan"
      />

      {/* Free Heap */}
      <MetricCard
        label="Free Heap"
        value={
          status.free_heap > 0
            ? `${(status.free_heap / 1024).toFixed(0)} KB`
            : "--"
        }
        icon={
          <svg
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z"
            />
          </svg>
        }
        accent={
          status.free_heap > 50000
            ? "emerald"
            : status.free_heap > 20000
              ? "amber"
              : "red"
        }
      />
    </div>
  );
}

// --- MetricCard ---

interface MetricCardProps {
  label: string;
  value: string;
  icon: React.ReactNode;
  accent:
    | "sky"
    | "emerald"
    | "amber"
    | "red"
    | "purple"
    | "cyan"
    | "slate";
  pulse?: boolean;
  sparkline?: boolean;
  sparklineValue?: number;
  sparklineMin?: number;
  sparklineMax?: number;
}

const accentMap: Record<string, { bg: string; text: string; dot: string }> = {
  sky: {
    bg: "bg-sky-500/10 border-sky-500/20",
    text: "text-sky-400",
    dot: "bg-sky-400",
  },
  emerald: {
    bg: "bg-emerald-500/10 border-emerald-500/20",
    text: "text-emerald-400",
    dot: "bg-emerald-400",
  },
  amber: {
    bg: "bg-amber-500/10 border-amber-500/20",
    text: "text-amber-400",
    dot: "bg-amber-400",
  },
  red: {
    bg: "bg-red-500/10 border-red-500/20",
    text: "text-red-400",
    dot: "bg-red-400",
  },
  purple: {
    bg: "bg-purple-500/10 border-purple-500/20",
    text: "text-purple-400",
    dot: "bg-purple-400",
  },
  cyan: {
    bg: "bg-cyan-500/10 border-cyan-500/20",
    text: "text-cyan-400",
    dot: "bg-cyan-400",
  },
  slate: {
    bg: "bg-slate-500/10 border-slate-500/20",
    text: "text-slate-400",
    dot: "bg-slate-400",
  },
};

function MetricCard({
  label,
  value,
  icon,
  accent,
  pulse,
  sparkline,
  sparklineValue,
  sparklineMin = 0,
  sparklineMax = 100,
}: MetricCardProps) {
  const colors = accentMap[accent] || accentMap.slate;

  return (
    <div className="rounded-xl border border-border/50 bg-bg-surface/30 p-4 backdrop-blur-sm">
      <div className="flex items-center justify-between mb-3">
        <div className={`flex items-center justify-center h-8 w-8 rounded-lg border ${colors.bg}`}>
          <div className={colors.text}>{icon}</div>
        </div>
        {pulse && (
          <div className="flex items-center gap-1.5">
            <div className={`h-1.5 w-1.5 rounded-full ${colors.dot} animate-pulse`} />
            <span className="text-[10px] text-text-secondary">LIVE</span>
          </div>
        )}
      </div>
      <div className="flex items-end justify-between">
        <div>
          <p className="text-2xl font-bold font-mono text-text-primary leading-tight">
            {value}
          </p>
          <p className="text-xs text-text-secondary mt-1">{label}</p>
        </div>
        {sparkline && sparklineValue !== undefined && (
          <MiniSparkline
            value={sparklineValue}
            min={sparklineMin}
            max={sparklineMax}
            color={colors.dot}
          />
        )}
      </div>
    </div>
  );
}

// --- Mini Sparkline ---

function MiniSparkline({
  value,
  min,
  max,
  color,
}: {
  value: number;
  min: number;
  max: number;
  color: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const historyRef = useRef<number[]>([]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = 60;
    const h = 24;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.scale(dpr, dpr);

    const pts = historyRef.current;
    if (pts.length < 2) {
      ctx.restore();
      return;
    }

    const range = max - min || 1;

    ctx.strokeStyle = "rgba(148,163,184,0.3)";
    ctx.lineWidth = 1;
    ctx.beginPath();

    for (let i = 0; i < pts.length; i++) {
      const x = (i / (pts.length - 1)) * w;
      const y = h - ((pts[i] - min) / range) * h;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Last point dot
    const lastX = w;
    const lastY = h - ((pts[pts.length - 1] - min) / range) * h;
    ctx.fillStyle = "rgba(148,163,184,0.6)";
    ctx.beginPath();
    ctx.arc(lastX, lastY, 2, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }, [min, max]);

  useEffect(() => {
    historyRef.current.push(value);
    if (historyRef.current.length > 30) {
      historyRef.current.shift();
    }
    draw();
  }, [value, draw]);

  return <canvas ref={canvasRef} className="block" />;
}
