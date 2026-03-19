"use client";

type ConnectionState = "connected" | "disconnected" | "connecting";

interface StatusBadgeProps {
  state: ConnectionState;
  label?: string;
  size?: "sm" | "md";
}

const stateConfig: Record<
  ConnectionState,
  { dotClass: string; text: string; textClass: string }
> = {
  connected: {
    dotClass: "bg-success",
    text: "Connected",
    textClass: "text-success",
  },
  disconnected: {
    dotClass: "bg-error",
    text: "Disconnected",
    textClass: "text-error",
  },
  connecting: {
    dotClass: "bg-warning animate-pulse",
    text: "Connecting...",
    textClass: "text-warning",
  },
};

export function StatusBadge({ state, label, size = "md" }: StatusBadgeProps) {
  const config = stateConfig[state];
  const isSmall = size === "sm";

  return (
    <div className="flex items-center gap-1.5">
      <div
        className={`rounded-full ${config.dotClass} ${
          isSmall ? "h-1.5 w-1.5" : "h-2 w-2"
        }`}
      />
      <span
        className={`${config.textClass} ${
          isSmall ? "text-xs" : "text-sm"
        } font-medium`}
      >
        {label ?? config.text}
      </span>
    </div>
  );
}

/**
 * Inline status dot without text — useful for compact indicators.
 */
export function StatusDot({
  state,
  size = "md",
}: {
  state: ConnectionState;
  size?: "sm" | "md" | "lg";
}) {
  const sizeMap = { sm: "h-1.5 w-1.5", md: "h-2 w-2", lg: "h-3 w-3" };
  const config = stateConfig[state];

  return <div className={`rounded-full ${config.dotClass} ${sizeMap[size]}`} />;
}
