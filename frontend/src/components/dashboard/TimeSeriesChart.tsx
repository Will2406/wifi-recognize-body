"use client";

import { useEffect, useRef, useCallback } from "react";
import type { CSIData } from "@/lib/types";

interface TimeSeriesChartProps {
  subscribe: (cb: (data: CSIData) => void) => () => void;
  /** Number of subcarriers to track (top N by variance) */
  numTracked?: number;
  /** Number of data points to show */
  windowSize?: number;
  height?: number;
}

// Distinct colors for tracked subcarriers
const COLORS = [
  "#0ea5e9", // sky-500
  "#10b981", // emerald-500
  "#f59e0b", // amber-500
  "#ef4444", // red-500
  "#a855f7", // purple-500
  "#ec4899", // pink-500
  "#06b6d4", // cyan-500
  "#84cc16", // lime-500
  "#f97316", // orange-500
  "#6366f1", // indigo-500
];

/**
 * Time series chart showing amplitude over time for the top N subcarriers
 * with highest variance. Canvas-based for performance.
 */
export function TimeSeriesChart({
  subscribe,
  numTracked = 6,
  windowSize = 300,
  height = 250,
}: TimeSeriesChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animFrameRef = useRef(0);

  // Per-subcarrier time series buffers: Map<subcarrierIndex, number[]>
  const seriesRef = useRef<Map<number, number[]>>(new Map());
  // Running variance tracker for picking top N subcarriers
  const varianceRef = useRef<Map<number, { mean: number; m2: number; n: number }>>(
    new Map()
  );
  // Which subcarrier indices are currently "top"
  const trackedRef = useRef<number[]>([]);
  const updateCountRef = useRef(0);
  const numSubcarriersRef = useRef(56);

  // Recalculate which subcarriers to track (every ~100 packets)
  const recalcTracked = useCallback(() => {
    const entries = Array.from(varianceRef.current.entries());
    const withVariance = entries
      .filter(([, v]) => v.n > 10)
      .map(([idx, v]) => ({
        idx,
        variance: v.n > 1 ? v.m2 / (v.n - 1) : 0,
      }))
      .sort((a, b) => b.variance - a.variance);

    trackedRef.current = withVariance.slice(0, numTracked).map((e) => e.idx);
  }, [numTracked]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;

    const padLeft = 45;
    const padRight = 80; // room for legend
    const padTop = 10;
    const padBottom = 30;
    const chartW = w - padLeft - padRight;
    const chartH = h - padTop - padBottom;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.scale(dpr, dpr);

    const tracked = trackedRef.current;

    if (tracked.length === 0) {
      ctx.fillStyle = "rgba(148,163,184,0.3)";
      ctx.font = "14px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(
        "Analyzing subcarrier variance...",
        padLeft + chartW / 2,
        padTop + chartH / 2
      );
      ctx.restore();
      return;
    }

    // Find Y range across all tracked series
    let yMin = Infinity;
    let yMax = -Infinity;

    for (const idx of tracked) {
      const series = seriesRef.current.get(idx);
      if (!series) continue;
      for (const v of series) {
        if (v < yMin) yMin = v;
        if (v > yMax) yMax = v;
      }
    }

    if (!isFinite(yMin)) yMin = 0;
    if (!isFinite(yMax)) yMax = 50;
    // Add padding
    const range = yMax - yMin || 1;
    yMin = Math.max(0, yMin - range * 0.05);
    yMax = yMax + range * 0.05;

    // Grid
    ctx.strokeStyle = "rgba(148,163,184,0.08)";
    ctx.lineWidth = 1;
    const ySteps = 5;
    for (let i = 0; i <= ySteps; i++) {
      const y = padTop + (chartH / ySteps) * i;
      ctx.beginPath();
      ctx.moveTo(padLeft, y);
      ctx.lineTo(padLeft + chartW, y);
      ctx.stroke();

      const val = (yMax - ((yMax - yMin) / ySteps) * i).toFixed(1);
      ctx.fillStyle = "rgba(148,163,184,0.5)";
      ctx.font = "10px ui-monospace, monospace";
      ctx.textAlign = "right";
      ctx.fillText(val, padLeft - 6, y + 3);
    }

    // Draw each tracked subcarrier's line
    for (let t = 0; t < tracked.length; t++) {
      const scIdx = tracked[t];
      const series = seriesRef.current.get(scIdx);
      if (!series || series.length < 2) continue;

      const color = COLORS[t % COLORS.length];
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.lineJoin = "round";
      ctx.beginPath();

      const pts = series.length;
      for (let i = 0; i < pts; i++) {
        const x = padLeft + (i / (windowSize - 1)) * chartW;
        const y =
          padTop + chartH - ((series[i] - yMin) / (yMax - yMin)) * chartH;

        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // Legend
    const legendX = padLeft + chartW + 10;
    let legendY = padTop + 5;
    ctx.font = "10px ui-monospace, monospace";
    ctx.textAlign = "left";

    for (let t = 0; t < tracked.length; t++) {
      const scIdx = tracked[t];
      const color = COLORS[t % COLORS.length];

      ctx.fillStyle = color;
      ctx.fillRect(legendX, legendY, 12, 2);

      ctx.fillStyle = "rgba(148,163,184,0.7)";
      ctx.fillText(`SC ${scIdx}`, legendX + 16, legendY + 4);

      legendY += 16;
    }

    // X-axis time labels
    ctx.fillStyle = "rgba(148,163,184,0.5)";
    ctx.font = "10px ui-monospace, monospace";
    ctx.textAlign = "center";
    const totalSec = windowSize / 50; // ~50 pps
    const xLabels = 5;
    for (let i = 0; i <= xLabels; i++) {
      const x = padLeft + (i / xLabels) * chartW;
      const t = -totalSec + (i / xLabels) * totalSec;
      ctx.fillText(`${t.toFixed(0)}s`, x, padTop + chartH + 18);
    }

    // Axis label
    ctx.fillStyle = "rgba(148,163,184,0.35)";
    ctx.font = "11px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Time", padLeft + chartW / 2, h - 2);

    ctx.restore();
  }, [windowSize]);

  // Animation loop
  useEffect(() => {
    let running = true;
    function loop() {
      if (!running) return;
      draw();
      animFrameRef.current = requestAnimationFrame(loop);
    }
    animFrameRef.current = requestAnimationFrame(loop);
    return () => {
      running = false;
      cancelAnimationFrame(animFrameRef.current);
    };
  }, [draw]);

  // Subscribe to data
  useEffect(() => {
    const unsub = subscribe((data: CSIData) => {
      const numSC = data.num_subcarriers || data.amplitudes.length;
      numSubcarriersRef.current = numSC;

      // Update per-subcarrier time series
      for (let i = 0; i < numSC; i++) {
        const amp = data.amplitudes[i] ?? 0;

        // Time series buffer
        if (!seriesRef.current.has(i)) {
          seriesRef.current.set(i, []);
        }
        const series = seriesRef.current.get(i)!;
        series.push(amp);
        if (series.length > windowSize) {
          series.shift();
        }

        // Welford's online variance
        if (!varianceRef.current.has(i)) {
          varianceRef.current.set(i, { mean: 0, m2: 0, n: 0 });
        }
        const v = varianceRef.current.get(i)!;
        v.n++;
        const delta = amp - v.mean;
        v.mean += delta / v.n;
        const delta2 = amp - v.mean;
        v.m2 += delta * delta2;
      }

      updateCountRef.current++;
      if (updateCountRef.current % 100 === 0) {
        recalcTracked();
      }
      // Initial calculation once we have some data
      if (updateCountRef.current === 20) {
        recalcTracked();
      }
    });
    return unsub;
  }, [subscribe, windowSize, recalcTracked]);

  // Resize
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = entry.contentRect.width;
        const dpr = window.devicePixelRatio || 1;
        canvas.width = w * dpr;
        canvas.height = height * dpr;
        canvas.style.width = `${w}px`;
        canvas.style.height = `${height}px`;
      }
    });

    observer.observe(container);

    const w = container.clientWidth;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = w * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${height}px`;

    return () => observer.disconnect();
  }, [height]);

  return (
    <div ref={containerRef} className="w-full">
      <canvas ref={canvasRef} className="block" />
    </div>
  );
}
