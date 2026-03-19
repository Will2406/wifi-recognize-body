"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useESP32Status } from "@/hooks/useESP32Status";
import { useCSIData } from "@/hooks/useCSIData";
import { StatusBadge } from "@/components/wifi/StatusBadge";
import { SignalBars } from "@/components/wifi/SignalBars";

interface NavLink {
  href: string;
  label: string;
  icon: React.ReactNode;
}

const navLinks: NavLink[] = [
  {
    href: "/dashboard",
    label: "Overview",
    icon: (
      <svg
        className="h-5 w-5"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
        />
      </svg>
    ),
  },
  {
    href: "/dashboard/csi",
    label: "CSI Monitor",
    icon: (
      <svg
        className="h-5 w-5"
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
    ),
  },
  {
    href: "/dashboard/settings",
    label: "Settings",
    icon: (
      <svg
        className="h-5 w-5"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
        />
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
        />
      </svg>
    ),
  },
];

export function Navbar() {
  const pathname = usePathname();
  const { status, connected: wsConnected } = useESP32Status();
  const { packetsPerSecond, isReceiving } = useCSIData();
  const [mobileOpen, setMobileOpen] = useState(false);

  const serialState = status.serial_connected ? "connected" : "disconnected";
  const wifiState = status.wifi_connected
    ? "connected"
    : status.serial_connected
      ? "connecting"
      : "disconnected";

  function isActive(href: string) {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(href);
  }

  return (
    <nav className="sticky top-0 z-50 border-b border-border/50 bg-bg-primary/80 backdrop-blur-xl">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="flex h-16 items-center justify-between">
          {/* Logo & title */}
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/20 border border-accent/30">
                <svg
                  className="h-5 w-5 text-accent"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.14 0M1.394 9.393c5.857-5.858 15.355-5.858 21.213 0"
                  />
                </svg>
              </div>
              <div className="hidden sm:block">
                <h1 className="text-sm font-bold text-text-primary leading-tight">
                  WiFi Sense Lab
                </h1>
                <p className="text-[10px] text-text-secondary leading-tight">
                  CSI Monitoring
                </p>
              </div>
            </Link>
          </div>

          {/* Desktop navigation links */}
          <div className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => {
              const active = isActive(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    active
                      ? "bg-accent/10 text-accent"
                      : "text-text-secondary hover:text-text-primary hover:bg-bg-surface/50"
                  }`}
                >
                  {link.icon}
                  {link.label}
                </Link>
              );
            })}
          </div>

          {/* Right side status indicators */}
          <div className="flex items-center gap-3">
            {/* CSI Packets counter */}
            {isReceiving && (
              <div className="hidden lg:flex items-center gap-2 rounded-lg border border-border/50 bg-bg-surface/30 px-3 py-1.5">
                <div className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
                <span className="text-xs font-mono text-text-secondary">
                  <span className="text-text-primary font-semibold">
                    {packetsPerSecond}
                  </span>{" "}
                  pkt/s
                </span>
              </div>
            )}

            {/* WiFi status pill */}
            <div className="hidden sm:flex items-center gap-2 rounded-lg border border-border/50 bg-bg-surface/30 px-3 py-1.5">
              {status.rssi !== null && <SignalBars rssi={status.rssi} size="sm" />}
              <div className="flex flex-col">
                <span className="text-xs font-medium text-text-primary leading-tight">
                  {status.ssid || "No WiFi"}
                </span>
                <span className="text-[10px] text-text-secondary leading-tight">
                  {status.channel ? `CH ${status.channel}` : ""}
                  {status.rssi !== null ? ` / ${status.rssi} dBm` : ""}
                </span>
              </div>
            </div>

            {/* ESP32 status badge */}
            <div className="flex items-center gap-2 rounded-lg border border-border/50 bg-bg-surface/30 px-3 py-1.5">
              <StatusBadge state={serialState} label="ESP32" size="sm" />
            </div>

            {/* Mobile hamburger */}
            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className="md:hidden flex items-center justify-center h-9 w-9 rounded-lg text-text-secondary hover:text-text-primary hover:bg-bg-surface/50"
            >
              <svg
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                {mobileOpen ? (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                ) : (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 6h16M4 12h16M4 18h16"
                  />
                )}
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Mobile navigation */}
      {mobileOpen && (
        <div className="md:hidden border-t border-border/50 bg-bg-primary/95 backdrop-blur-xl">
          <div className="px-4 py-3 space-y-1">
            {navLinks.map((link) => {
              const active = isActive(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileOpen(false)}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                    active
                      ? "bg-accent/10 text-accent"
                      : "text-text-secondary hover:text-text-primary hover:bg-bg-surface/50"
                  }`}
                >
                  {link.icon}
                  {link.label}
                </Link>
              );
            })}

            {/* Mobile status info */}
            <div className="pt-3 mt-3 border-t border-border/30 space-y-2">
              <div className="flex items-center justify-between px-3">
                <span className="text-xs text-text-secondary">WiFi</span>
                <StatusBadge state={wifiState} size="sm" />
              </div>
              <div className="flex items-center justify-between px-3">
                <span className="text-xs text-text-secondary">Serial</span>
                <StatusBadge state={serialState} size="sm" />
              </div>
              {isReceiving && (
                <div className="flex items-center justify-between px-3">
                  <span className="text-xs text-text-secondary">CSI Rate</span>
                  <span className="text-xs font-mono text-text-primary">
                    {packetsPerSecond} pkt/s
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
