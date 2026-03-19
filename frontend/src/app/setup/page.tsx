"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { WiFiNetwork, WiFiConnectResponse } from "@/lib/types";
import { fetchNetworks } from "@/lib/api";
import { useESP32Status } from "@/hooks/useESP32Status";
import { NetworkList } from "@/components/wifi/NetworkList";
import { ConnectForm } from "@/components/wifi/ConnectForm";

type SetupPhase = "scanning" | "selecting" | "connected";

export default function SetupPage() {
  const router = useRouter();
  const { status: esp32Status, connected: wsConnected } = useESP32Status();

  const [networks, setNetworks] = useState<WiFiNetwork[]>([]);
  const [selectedNetwork, setSelectedNetwork] = useState<WiFiNetwork | null>(
    null
  );
  const [scanning, setScanning] = useState(true);
  const [phase, setPhase] = useState<SetupPhase>("scanning");
  const [connectResult, setConnectResult] =
    useState<WiFiConnectResponse | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);

  const scanNetworks = useCallback(async () => {
    setScanning(true);
    setScanError(null);
    setSelectedNetwork(null);
    setPhase("scanning");

    try {
      const results = await fetchNetworks();
      setNetworks(results);
      setPhase("selecting");
    } catch (err) {
      setScanError(
        err instanceof Error
          ? err.message
          : "Failed to scan networks. Is the backend running?"
      );
      setPhase("selecting");
    } finally {
      setScanning(false);
    }
  }, []);

  useEffect(() => {
    scanNetworks();
  }, [scanNetworks]);

  function handleSelectNetwork(network: WiFiNetwork) {
    setSelectedNetwork(network);
  }

  function handleConnectSuccess(response: WiFiConnectResponse) {
    setConnectResult(response);
    setPhase("connected");

    // Redirect to dashboard after 2 seconds
    setTimeout(() => {
      router.push("/dashboard");
    }, 2000);
  }

  function handleCancelConnect() {
    setSelectedNetwork(null);
  }

  return (
    <div className="flex min-h-screen flex-col">
      {/* Background gradient */}
      <div className="fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-bg-primary" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 h-[500px] w-[800px] rounded-full bg-accent/5 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-[300px] w-[500px] rounded-full bg-sky-900/10 blur-3xl" />
      </div>

      {/* Header */}
      <header className="border-b border-border/50 backdrop-blur-sm">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-xl font-bold text-text-primary flex items-center gap-2">
              <svg
                className="h-6 w-6 text-accent"
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
              WiFi Sense Lab
            </h1>
            <p className="text-xs text-text-secondary mt-0.5">
              Select a 2.4GHz network for CSI capture
            </p>
          </div>

          {/* ESP32 connection status */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 rounded-full border border-slate-700/50 bg-bg-surface/50 px-3 py-1.5">
              <div
                className={`h-2 w-2 rounded-full ${
                  esp32Status.serial_connected
                    ? "bg-success animate-pulse"
                    : "bg-error"
                }`}
              />
              <span className="text-xs text-text-secondary">
                ESP32{" "}
                {esp32Status.serial_connected ? "Connected" : "Disconnected"}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-8">
        {/* WebSocket connection banner */}
        {!wsConnected && (
          <div className="mb-6 flex items-center gap-2 rounded-lg bg-amber-500/10 border border-amber-500/20 px-4 py-3">
            <svg
              className="h-4 w-4 text-warning shrink-0"
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
            <p className="text-sm text-warning">
              Connecting to backend server...
            </p>
          </div>
        )}

        {/* Connected success view */}
        {phase === "connected" && connectResult && (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-success/20 border-2 border-success/30">
              <svg
                className="h-10 w-10 text-success"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2.5}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-text-primary mb-2">
              Connected!
            </h2>
            <p className="text-text-secondary text-center mb-6">
              Successfully connected to the WiFi network.
            </p>
            <div className="rounded-xl border border-slate-700/50 bg-bg-surface/50 p-4 w-full max-w-sm">
              {connectResult.ip && (
                <div className="flex justify-between py-1.5">
                  <span className="text-sm text-text-secondary">
                    IP Address
                  </span>
                  <span className="text-sm font-mono text-text-primary">
                    {connectResult.ip}
                  </span>
                </div>
              )}
              {connectResult.channel && (
                <div className="flex justify-between py-1.5">
                  <span className="text-sm text-text-secondary">Channel</span>
                  <span className="text-sm font-mono text-text-primary">
                    {connectResult.channel}
                  </span>
                </div>
              )}
              {connectResult.bssid && (
                <div className="flex justify-between py-1.5">
                  <span className="text-sm text-text-secondary">BSSID</span>
                  <span className="text-sm font-mono text-text-primary">
                    {connectResult.bssid}
                  </span>
                </div>
              )}
            </div>
            <p className="mt-6 text-xs text-text-secondary animate-pulse">
              Redirecting to dashboard...
            </p>
          </div>
        )}

        {/* Network selection view */}
        {phase !== "connected" && (
          <>
            {/* Section header */}
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-lg font-semibold text-text-primary">
                  Available Networks
                </h2>
                <p className="text-xs text-text-secondary mt-0.5">
                  {scanning
                    ? "Scanning for networks..."
                    : `${networks.length} network${networks.length !== 1 ? "s" : ""} found`}
                </p>
              </div>
            </div>

            {/* Scan error */}
            {scanError && (
              <div className="mb-4 flex items-start gap-2 rounded-lg bg-red-500/10 border border-red-500/20 p-4">
                <svg
                  className="h-4 w-4 text-error shrink-0 mt-0.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <p className="text-sm text-error">{scanError}</p>
              </div>
            )}

            {/* Network list */}
            <NetworkList
              networks={networks}
              selectedSSID={selectedNetwork?.ssid ?? null}
              onSelect={handleSelectNetwork}
              loading={scanning}
            />

            {/* Connect form */}
            {selectedNetwork && (
              <ConnectForm
                network={selectedNetwork}
                onSuccess={handleConnectSuccess}
                onCancel={handleCancelConnect}
              />
            )}

            {/* Scan again button */}
            <div className="mt-6 flex justify-center">
              <button
                onClick={scanNetworks}
                disabled={scanning}
                className="flex items-center gap-2 rounded-lg border border-slate-700/50 bg-bg-surface/50 px-5 py-2.5 text-sm text-text-secondary hover:text-text-primary hover:bg-bg-surface transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <svg
                  className={`h-4 w-4 ${scanning ? "animate-spin" : ""}`}
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
                {scanning ? "Scanning..." : "Scan Again"}
              </button>
            </div>
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-border/50 py-4">
        <p className="text-center text-xs text-text-secondary">
          WiFi Sense Lab &middot; ESP32 CSI-based Presence Detection
        </p>
      </footer>
    </div>
  );
}
