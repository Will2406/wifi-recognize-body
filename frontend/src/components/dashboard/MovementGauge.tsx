'use client';

interface MovementGaugeProps {
  movement: number;
  movementLabel: 'quiet' | 'light' | 'strong';
  calibrated: boolean;
}

export function MovementGauge({
  movement,
  movementLabel,
  calibrated,
}: MovementGaugeProps) {
  // Clamp movement to 0-100
  const level = Math.min(100, Math.max(0, movement));

  // Label display text and colors
  const labelConfig = {
    quiet: {
      text: 'Quiet',
      color: 'text-sky-400',
      barColor: 'bg-sky-500',
      bgAccent: 'bg-sky-500/10',
    },
    light: {
      text: 'Light Movement',
      color: 'text-amber-400',
      barColor: 'bg-amber-500',
      bgAccent: 'bg-amber-500/10',
    },
    strong: {
      text: 'Strong Movement',
      color: 'text-red-400',
      barColor: 'bg-red-500',
      bgAccent: 'bg-red-500/10',
    },
  };

  const config = labelConfig[movementLabel];

  // Determine bar gradient color based on fill position
  const getBarGradient = () => {
    if (level <= 5) return 'bg-gradient-to-r from-sky-600 to-sky-500';
    if (level <= 30) return 'bg-gradient-to-r from-sky-500 via-amber-500 to-amber-500';
    return 'bg-gradient-to-r from-sky-500 via-amber-500 to-red-500';
  };

  return (
    <div className="rounded-xl border border-border/50 bg-bg-surface/30 p-5 backdrop-blur-sm flex flex-col justify-center min-h-[200px]">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-[10px] text-text-secondary uppercase tracking-wider mb-1">
            Movement Level
          </p>
          <p className={`text-sm font-semibold ${config.color} transition-colors duration-300`}>
            {calibrated ? config.text : 'Awaiting Calibration'}
          </p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold font-mono text-text-primary leading-tight">
            {calibrated ? `${level.toFixed(1)}%` : '--'}
          </p>
        </div>
      </div>

      {/* Gauge bar */}
      <div className="relative">
        {/* Background track with zone markers */}
        <div className="h-4 rounded-full bg-slate-800 border border-slate-700/50 overflow-hidden relative">
          {/* Zone backgrounds */}
          <div className="absolute inset-0 flex">
            <div className="bg-sky-500/10" style={{ width: '5%' }} />
            <div className="bg-amber-500/10" style={{ width: '25%' }} />
            <div className="bg-red-500/10" style={{ width: '70%' }} />
          </div>

          {/* Fill bar */}
          {calibrated && (
            <div
              className={`absolute top-0 left-0 h-full rounded-full ${getBarGradient()} transition-all duration-500 ease-out`}
              style={{ width: `${Math.max(level, 1)}%` }}
            >
              {/* Shimmer effect for strong movement */}
              {movementLabel === 'strong' && (
                <div className="absolute inset-0 rounded-full bg-gradient-to-r from-transparent via-white/10 to-transparent animate-pulse" />
              )}
            </div>
          )}
        </div>

        {/* Zone labels below the bar */}
        <div className="flex mt-2">
          <div className="flex items-center gap-1" style={{ width: '5%', minWidth: '40px' }}>
            <div className="h-1.5 w-1.5 rounded-full bg-sky-500 shrink-0" />
            <span className="text-[9px] text-text-secondary whitespace-nowrap">Quiet</span>
          </div>
          <div className="flex items-center gap-1 ml-1" style={{ width: '25%', minWidth: '40px' }}>
            <div className="h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0" />
            <span className="text-[9px] text-text-secondary whitespace-nowrap">Light</span>
          </div>
          <div className="flex items-center gap-1 ml-1">
            <div className="h-1.5 w-1.5 rounded-full bg-red-500 shrink-0" />
            <span className="text-[9px] text-text-secondary whitespace-nowrap">Strong</span>
          </div>
        </div>
      </div>

      {/* Threshold markers */}
      <div className="flex items-center gap-3 mt-4 pt-3 border-t border-border/20">
        <ThresholdBadge label="Quiet" range="0-5%" color="sky" active={movementLabel === 'quiet' && calibrated} />
        <ThresholdBadge label="Light" range="5-30%" color="amber" active={movementLabel === 'light' && calibrated} />
        <ThresholdBadge label="Strong" range="30%+" color="red" active={movementLabel === 'strong' && calibrated} />
      </div>
    </div>
  );
}

function ThresholdBadge({
  label,
  range,
  color,
  active,
}: {
  label: string;
  range: string;
  color: 'sky' | 'amber' | 'red';
  active: boolean;
}) {
  const colorMap = {
    sky: {
      bg: active ? 'bg-sky-500/20 border-sky-500/40' : 'bg-slate-800/50 border-slate-700/30',
      text: active ? 'text-sky-400' : 'text-text-secondary',
    },
    amber: {
      bg: active ? 'bg-amber-500/20 border-amber-500/40' : 'bg-slate-800/50 border-slate-700/30',
      text: active ? 'text-amber-400' : 'text-text-secondary',
    },
    red: {
      bg: active ? 'bg-red-500/20 border-red-500/40' : 'bg-slate-800/50 border-slate-700/30',
      text: active ? 'text-red-400' : 'text-text-secondary',
    },
  };

  const c = colorMap[color];

  return (
    <div className={`flex-1 rounded-lg border px-2 py-1.5 text-center ${c.bg} transition-all duration-300`}>
      <p className={`text-[10px] font-medium ${c.text}`}>{label}</p>
      <p className="text-[9px] text-text-secondary">{range}</p>
    </div>
  );
}
