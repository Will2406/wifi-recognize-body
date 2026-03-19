"use client";

import { useEffect, useRef, useCallback } from "react";
import type { CSIData } from "@/lib/types";

interface SpectrogramViewProps {
  subscribe: (cb: (data: CSIData) => void) => () => void;
  /** Number of time columns to display (seconds * pps) */
  timeColumns?: number;
  height?: number;
}

/**
 * Time-frequency heatmap (spectrogram) of CSI amplitudes.
 * X = time (scrolling), Y = subcarrier index, Color = amplitude.
 *
 * Uses Canvas putImageData for maximum performance.
 */
export function SpectrogramView({
  subscribe,
  timeColumns = 400,
  height = 350,
}: SpectrogramViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const legendCanvasRef = useRef<HTMLCanvasElement>(null);

  // Ring buffer for spectrogram columns: each column is an array of amplitudes
  const bufferRef = useRef<Float32Array[]>([]);
  const writeIndexRef = useRef(0);
  const filledRef = useRef(0);
  const numSubcarriersRef = useRef(56);
  const maxAmpRef = useRef(50);
  const animFrameRef = useRef(0);

  // Color lookup table (256 entries)
  const colorLUTRef = useRef<Uint8ClampedArray | null>(null);

  const buildColorLUT = useCallback(() => {
    // Dark blue -> cyan -> green -> yellow -> red
    const lut = new Uint8ClampedArray(256 * 4);
    const stops = [
      { pos: 0, r: 15, g: 23, b: 42 }, // slate-900 (background)
      { pos: 0.08, r: 30, g: 58, b: 138 }, // blue-800
      { pos: 0.2, r: 14, g: 116, b: 144 }, // cyan-700
      { pos: 0.35, r: 16, g: 185, b: 129 }, // emerald-500
      { pos: 0.55, r: 132, g: 204, b: 22 }, // lime-500
      { pos: 0.7, r: 250, g: 204, b: 21 }, // yellow-400
      { pos: 0.85, r: 249, g: 115, b: 22 }, // orange-500
      { pos: 1.0, r: 239, g: 68, b: 68 }, // red-500
    ];

    for (let i = 0; i < 256; i++) {
      const t = i / 255;
      // Find surrounding stops
      let lower = stops[0];
      let upper = stops[stops.length - 1];
      for (let s = 0; s < stops.length - 1; s++) {
        if (t >= stops[s].pos && t <= stops[s + 1].pos) {
          lower = stops[s];
          upper = stops[s + 1];
          break;
        }
      }
      const range = upper.pos - lower.pos;
      const st = range > 0 ? (t - lower.pos) / range : 0;
      lut[i * 4 + 0] = Math.round(lower.r + st * (upper.r - lower.r));
      lut[i * 4 + 1] = Math.round(lower.g + st * (upper.g - lower.g));
      lut[i * 4 + 2] = Math.round(lower.b + st * (upper.b - lower.b));
      lut[i * 4 + 3] = 255;
    }
    colorLUTRef.current = lut;
  }, []);

  // Draw the color legend
  const drawLegend = useCallback(() => {
    const canvas = legendCanvasRef.current;
    if (!canvas || !colorLUTRef.current) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = 20;
    const h = canvas.height / dpr;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.scale(dpr, dpr);

    const lut = colorLUTRef.current;
    for (let y = 0; y < h; y++) {
      const t = 1 - y / h; // top = high amplitude
      const idx = Math.min(Math.floor(t * 255), 255) * 4;
      ctx.fillStyle = `rgb(${lut[idx]},${lut[idx + 1]},${lut[idx + 2]})`;
      ctx.fillRect(0, y, w, 1);
    }

    ctx.restore();
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !colorLUTRef.current) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;

    const padLeft = 40;
    const padRight = 35;
    const padTop = 10;
    const padBottom = 30;
    const chartW = w - padLeft - padRight;
    const chartH = h - padTop - padBottom;

    const numSC = numSubcarriersRef.current;
    const filled = filledRef.current;
    const maxAmp = maxAmpRef.current;
    const lut = colorLUTRef.current;

    // Create ImageData for the spectrogram area
    const imgW = Math.floor(chartW);
    const imgH = Math.floor(chartH);

    if (imgW <= 0 || imgH <= 0) return;

    const imageData = ctx.createImageData(imgW, imgH);
    const pixels = imageData.data;

    // Fill with background
    for (let i = 0; i < pixels.length; i += 4) {
      pixels[i] = 15;
      pixels[i + 1] = 23;
      pixels[i + 2] = 42;
      pixels[i + 3] = 255;
    }

    if (filled > 0) {
      const cols = Math.min(filled, timeColumns);
      const colWidth = imgW / timeColumns;
      const rowHeight = imgH / numSC;

      for (let c = 0; c < cols; c++) {
        // Read from ring buffer
        const bufIdx =
          (writeIndexRef.current - cols + c + bufferRef.current.length) %
          bufferRef.current.length;
        const col = bufferRef.current[bufIdx];
        if (!col) continue;

        const xStart = Math.floor(c * colWidth);
        const xEnd = Math.floor((c + 1) * colWidth);

        for (let sc = 0; sc < numSC; sc++) {
          const amp = col[sc] ?? 0;
          const t = Math.min(amp / Math.max(maxAmp, 1), 1);
          const lutIdx = Math.min(Math.floor(t * 255), 255) * 4;

          // Y is inverted: subcarrier 0 at bottom
          const yStart = Math.floor((numSC - 1 - sc) * rowHeight);
          const yEnd = Math.floor((numSC - sc) * rowHeight);

          for (let py = yStart; py < yEnd && py < imgH; py++) {
            for (let px = xStart; px < xEnd && px < imgW; px++) {
              const idx = (py * imgW + px) * 4;
              pixels[idx] = lut[lutIdx];
              pixels[idx + 1] = lut[lutIdx + 1];
              pixels[idx + 2] = lut[lutIdx + 2];
              pixels[idx + 3] = 255;
            }
          }
        }
      }
    }

    // Clear and draw
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.scale(dpr, dpr);

    // Put the spectrogram image
    // We need to use a temporary canvas to scale the ImageData
    const tmpCanvas = document.createElement("canvas");
    tmpCanvas.width = imgW;
    tmpCanvas.height = imgH;
    const tmpCtx = tmpCanvas.getContext("2d");
    if (tmpCtx) {
      tmpCtx.putImageData(imageData, 0, 0);
      ctx.drawImage(tmpCanvas, padLeft, padTop, chartW, chartH);
    }

    // Y-axis labels (subcarrier indices)
    ctx.fillStyle = "rgba(148,163,184,0.5)";
    ctx.font = "10px ui-monospace, monospace";
    ctx.textAlign = "right";
    const yStep = numSC > 40 ? 10 : 5;
    for (let sc = 0; sc <= numSC; sc += yStep) {
      const y = padTop + chartH - (sc / numSC) * chartH;
      ctx.fillText(String(sc), padLeft - 6, y + 3);
    }

    // X-axis time markers
    ctx.textAlign = "center";
    const totalTime = timeColumns / 50; // assuming ~50 pps
    const xStep = Math.ceil(totalTime / 5); // ~5 labels
    for (let t = 0; t <= totalTime; t += xStep) {
      const x = padLeft + (t / totalTime) * chartW;
      ctx.fillText(`-${Math.round(totalTime - t)}s`, x, padTop + chartH + 18);
    }

    // Axis labels
    ctx.fillStyle = "rgba(148,163,184,0.35)";
    ctx.font = "11px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Time", padLeft + chartW / 2, h - 2);

    ctx.save();
    ctx.translate(11, padTop + chartH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText("Subcarrier", 0, 0);
    ctx.restore();

    // No data overlay
    if (filled === 0) {
      ctx.fillStyle = "rgba(148,163,184,0.3)";
      ctx.font = "14px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(
        "Waiting for CSI data...",
        padLeft + chartW / 2,
        padTop + chartH / 2
      );
    }

    ctx.restore();
  }, [timeColumns]);

  // Build color LUT on mount
  useEffect(() => {
    buildColorLUT();
    drawLegend();
  }, [buildColorLUT, drawLegend]);

  // Initialize ring buffer
  useEffect(() => {
    bufferRef.current = new Array(timeColumns)
      .fill(null)
      .map(() => new Float32Array(64));
    writeIndexRef.current = 0;
    filledRef.current = 0;
  }, [timeColumns]);

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
      numSubcarriersRef.current = data.num_subcarriers || data.amplitudes.length;
      const numSC = numSubcarriersRef.current;

      // Write into ring buffer
      const arr =
        bufferRef.current[writeIndexRef.current] ||
        new Float32Array(numSC);

      // Ensure array is big enough
      if (arr.length < numSC) {
        bufferRef.current[writeIndexRef.current] = new Float32Array(numSC);
      }

      const target = bufferRef.current[writeIndexRef.current];
      for (let i = 0; i < numSC; i++) {
        target[i] = data.amplitudes[i] ?? 0;
      }

      writeIndexRef.current =
        (writeIndexRef.current + 1) % bufferRef.current.length;
      filledRef.current = Math.min(
        filledRef.current + 1,
        bufferRef.current.length
      );

      // Adaptive max
      const currentMax = Math.max(...data.amplitudes, 1);
      if (currentMax > maxAmpRef.current) {
        maxAmpRef.current = currentMax;
      } else {
        maxAmpRef.current =
          maxAmpRef.current * 0.9995 + currentMax * 0.0005;
        maxAmpRef.current = Math.max(maxAmpRef.current, 10);
      }
    });
    return unsub;
  }, [subscribe]);

  // Resize handler
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    const legend = legendCanvasRef.current;
    if (!container || !canvas) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = entry.contentRect.width - 30; // room for legend
        const dpr = window.devicePixelRatio || 1;
        canvas.width = w * dpr;
        canvas.height = height * dpr;
        canvas.style.width = `${w}px`;
        canvas.style.height = `${height}px`;

        if (legend) {
          legend.width = 20 * dpr;
          legend.height = height * dpr;
          legend.style.width = "20px";
          legend.style.height = `${height}px`;
          drawLegend();
        }
      }
    });

    observer.observe(container);

    // Initial size
    const w = container.clientWidth - 30;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = w * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${height}px`;

    if (legend) {
      legend.width = 20 * dpr;
      legend.height = height * dpr;
      legend.style.width = "20px";
      legend.style.height = `${height}px`;
      drawLegend();
    }

    return () => observer.disconnect();
  }, [height, drawLegend]);

  return (
    <div ref={containerRef} className="w-full flex items-start gap-2">
      <canvas ref={canvasRef} className="block flex-1" />
      <div className="flex flex-col items-center gap-1 pt-2.5">
        <span className="text-[9px] text-text-secondary">High</span>
        <canvas ref={legendCanvasRef} className="block rounded-sm" />
        <span className="text-[9px] text-text-secondary">Low</span>
      </div>
    </div>
  );
}
