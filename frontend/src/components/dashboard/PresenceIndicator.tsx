'use client';

interface PresenceIndicatorProps {
  presence: boolean;
  varianceRatio: number;
  calibrated: boolean;
  calibrating: boolean;
}

export function PresenceIndicator({
  presence,
  varianceRatio,
  calibrated,
  calibrating,
}: PresenceIndicatorProps) {
  // Determine display state
  const isCalibrating = calibrating;
  const isNotCalibrated = !calibrated && !calibrating;

  // Circle colors
  let circleColor = 'bg-emerald-500';
  let circleShadow = 'shadow-emerald-500/30';
  let pulseColor = 'bg-emerald-400';
  let statusText = 'No Presence';
  let statusColor = 'text-emerald-400';

  if (isCalibrating) {
    circleColor = 'bg-amber-500';
    circleShadow = 'shadow-amber-500/30';
    pulseColor = 'bg-amber-400';
    statusText = 'Calibrating...';
    statusColor = 'text-amber-400';
  } else if (isNotCalibrated) {
    circleColor = 'bg-slate-500';
    circleShadow = 'shadow-slate-500/30';
    pulseColor = 'bg-slate-400';
    statusText = 'Not Calibrated';
    statusColor = 'text-slate-400';
  } else if (presence) {
    circleColor = 'bg-red-500';
    circleShadow = 'shadow-red-500/30';
    pulseColor = 'bg-red-400';
    statusText = 'Presence Detected';
    statusColor = 'text-red-400';
  }

  return (
    <div className="rounded-xl border border-border/50 bg-bg-surface/30 p-5 backdrop-blur-sm flex flex-col items-center justify-center min-h-[200px]">
      <div className="relative flex items-center justify-center mb-4">
        {/* Pulse ring animation */}
        <div
          className={`absolute h-28 w-28 rounded-full ${pulseColor} opacity-20 ${
            presence || isCalibrating ? 'animate-ping' : 'animate-pulse'
          }`}
          style={{ animationDuration: presence ? '1.5s' : '3s' }}
        />
        {/* Outer glow */}
        <div
          className={`absolute h-24 w-24 rounded-full ${pulseColor} opacity-10`}
        />
        {/* Main circle */}
        <div
          className={`relative h-20 w-20 rounded-full ${circleColor} ${circleShadow} shadow-lg flex items-center justify-center transition-colors duration-500`}
        >
          {/* Icon inside circle */}
          {isCalibrating ? (
            <svg
              className="h-8 w-8 text-white animate-spin"
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
          ) : isNotCalibrated ? (
            <svg
              className="h-8 w-8 text-white/80"
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
          ) : presence ? (
            <svg
              className="h-8 w-8 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
              />
            </svg>
          ) : (
            <svg
              className="h-8 w-8 text-white"
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
          )}
        </div>
      </div>

      {/* Status text */}
      <p className={`text-sm font-semibold ${statusColor} transition-colors duration-500`}>
        {statusText}
      </p>

      {/* Variance ratio */}
      {calibrated && (
        <p className="text-xs text-text-secondary mt-1.5 font-mono">
          Variance Ratio: {varianceRatio.toFixed(3)}
        </p>
      )}

      {/* Label */}
      <p className="text-[10px] text-text-secondary mt-2 uppercase tracking-wider">
        Presence Detection
      </p>
    </div>
  );
}
