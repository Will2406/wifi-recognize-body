"use client";

interface SignalBarsProps {
  rssi: number;
  size?: "sm" | "md";
}

function getSignalLevel(rssi: number): number {
  if (rssi > -50) return 4;
  if (rssi > -65) return 3;
  if (rssi > -75) return 2;
  return 1;
}

function getSignalColor(level: number): string {
  switch (level) {
    case 4:
      return "bg-emerald-500";
    case 3:
      return "bg-emerald-400";
    case 2:
      return "bg-amber-500";
    default:
      return "bg-red-500";
  }
}

function getSignalLabel(level: number): string {
  switch (level) {
    case 4:
      return "Excellent";
    case 3:
      return "Good";
    case 2:
      return "Fair";
    default:
      return "Weak";
  }
}

export function SignalBars({ rssi, size = "md" }: SignalBarsProps) {
  const level = getSignalLevel(rssi);
  const color = getSignalColor(level);
  const barHeights = size === "sm" ? [6, 10, 14, 18] : [8, 13, 18, 23];
  const barWidth = size === "sm" ? 3 : 4;
  const gap = size === "sm" ? 1 : 1.5;
  const containerHeight = size === "sm" ? 18 : 23;

  return (
    <div
      className="flex items-end"
      style={{ gap: `${gap}px`, height: `${containerHeight}px` }}
      title={`${getSignalLabel(level)} (${rssi} dBm)`}
      aria-label={`Signal strength: ${getSignalLabel(level)}, ${rssi} dBm`}
    >
      {barHeights.map((height, index) => (
        <div
          key={index}
          className={`rounded-sm transition-all duration-200 ${
            index < level ? color : "bg-slate-700"
          }`}
          style={{
            width: `${barWidth}px`,
            height: `${height}px`,
          }}
        />
      ))}
    </div>
  );
}
