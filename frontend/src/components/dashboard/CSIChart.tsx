"use client";

import { useEffect, useRef, useCallback } from "react";
import type { CSIData } from "@/lib/types";

interface CSIChartProps {
  /** Subscribe to raw CSI data for every-packet updates */
  subscribe: (cb: (data: CSIData) => void) => () => void;
  /** Chart width — defaults to container width */
  width?: number;
  /** Chart height */
  height?: number;
}

// Color stops for amplitude gradient: low (sky) -> mid (green) -> high (red)
function amplitudeColor(amplitude: number, maxAmplitude: number): string {
  const t = Math.min(amplitude / Math.max(maxAmplitude, 1), 1);
  if (t < 0.4) {
    // sky-500 to emerald-400
    const s = t / 0.4;
    const r = Math.round(14 + s * (52 - 14));
    const g = Math.round(165 + s * (211 - 165));
    const b = Math.round(233 + s * (153 - 233));
    return `rgb(${r},${g},${b})`;
  } else if (t < 0.7) {
    // emerald-400 to amber-400
    const s = (t - 0.4) / 0.3;
    const r = Math.round(52 + s * (251 - 52));
    const g = Math.round(211 + s * (191 - 211));
    const b = Math.round(153 + s * (36 - 153));
    return `rgb(${r},${g},${b})`;
  } else {
    // amber-400 to red-500
    const s = (t - 0.7) / 0.3;
    const r = Math.round(251 + s * (239 - 251));
    const g = Math.round(191 + s * (68 - 191));
    const b = Math.round(36 + s * (68 - 36));
    return `rgb(${r},${g},${b})`;
  }
}

/**
 * Real-time bar chart of CSI subcarrier amplitudes.
 * Uses Canvas API for high-performance rendering via requestAnimationFrame.
 */
export function CSIChart({ subscribe, height = 300 }: CSIChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const latestDataRef = useRef<number[]>([]);
  const animFrameRef = useRef<number>(0);
  const maxAmplitudeRef = useRef<number>(50);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;

    const amplitudes = latestDataRef.current;
    const numBars = amplitudes.length || 56;
    const maxAmp = maxAmplitudeRef.current;

    // Clear
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw area
    const padLeft = 45;
    const padRight = 15;
    const padTop = 10;
    const padBottom = 35;
    const chartW = w - padLeft - padRight;
    const chartH = h - padTop - padBottom;

    // Background grid
    ctx.save();
    ctx.scale(dpr, dpr);

    // Y-axis gridlines
    ctx.strokeStyle = "rgba(148,163,184,0.08)";
    ctx.lineWidth = 1;
    const ySteps = 5;
    for (let i = 0; i <= ySteps; i++) {
      const y = padTop + (chartH / ySteps) * i;
      ctx.beginPath();
      ctx.moveTo(padLeft, y);
      ctx.lineTo(padLeft + chartW, y);
      ctx.stroke();

      // Y-axis labels
      const val = Math.round(maxAmp - (maxAmp / ySteps) * i);
      ctx.fillStyle = "rgba(148,163,184,0.5)";
      ctx.font = "10px ui-monospace, monospace";
      ctx.textAlign = "right";
      ctx.fillText(String(val), padLeft - 8, y + 3);
    }

    // Draw bars
    if (amplitudes.length > 0) {
      const barGap = 1;
      const barWidth = Math.max(
        (chartW - barGap * (numBars - 1)) / numBars,
        2
      );

      for (let i = 0; i < amplitudes.length; i++) {
        const amp = amplitudes[i] ?? 0;
        const barH = Math.max((amp / maxAmp) * chartH, 1);
        const x = padLeft + i * (barWidth + barGap);
        const y = padTop + chartH - barH;

        // Bar fill
        ctx.fillStyle = amplitudeColor(amp, maxAmp);
        ctx.beginPath();
        // Rounded top
        const radius = Math.min(barWidth / 2, 3);
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + barWidth - radius, y);
        ctx.quadraticCurveTo(x + barWidth, y, x + barWidth, y + radius);
        ctx.lineTo(x + barWidth, padTop + chartH);
        ctx.lineTo(x, padTop + chartH);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.fill();
      }

      // X-axis labels (every 5th or 10th subcarrier)
      const step = numBars > 40 ? 10 : 5;
      ctx.fillStyle = "rgba(148,163,184,0.5)";
      ctx.font = "10px ui-monospace, monospace";
      ctx.textAlign = "center";
      for (let i = 0; i < numBars; i += step) {
        const x = padLeft + i * (barWidth + barGap) + barWidth / 2;
        ctx.fillText(String(i), x, padTop + chartH + 18);
      }
    } else {
      // No data placeholder
      ctx.fillStyle = "rgba(148,163,184,0.3)";
      ctx.font = "14px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(
        "Waiting for CSI data...",
        padLeft + chartW / 2,
        padTop + chartH / 2
      );
    }

    // Axis labels
    ctx.fillStyle = "rgba(148,163,184,0.4)";
    ctx.font = "11px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Subcarrier Index", padLeft + chartW / 2, h - 4);

    ctx.save();
    ctx.translate(12, padTop + chartH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText("Amplitude", 0, 0);
    ctx.restore();

    ctx.restore();
  }, []);

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

  // Subscribe to CSI data
  useEffect(() => {
    const unsub = subscribe((data: CSIData) => {
      latestDataRef.current = data.amplitudes;
      // Adaptive max amplitude with slow decay
      const currentMax = Math.max(...data.amplitudes, 1);
      if (currentMax > maxAmplitudeRef.current) {
        maxAmplitudeRef.current = currentMax;
      } else {
        // Slowly decay max toward actual
        maxAmplitudeRef.current =
          maxAmplitudeRef.current * 0.999 + currentMax * 0.001;
        maxAmplitudeRef.current = Math.max(maxAmplitudeRef.current, 10);
      }
    });
    return unsub;
  }, [subscribe]);

  // Resize handler
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

    // Initial size
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
