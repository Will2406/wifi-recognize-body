"use client";

import { useState, type FormEvent } from "react";
import type { WiFiNetwork, WiFiConnectResponse } from "@/lib/types";
import { connectToNetwork } from "@/lib/api";

interface ConnectFormProps {
  network: WiFiNetwork;
  onSuccess: (response: WiFiConnectResponse) => void;
  onCancel: () => void;
}

export function ConnectForm({ network, onSuccess, onCancel }: ConnectFormProps) {
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const response = await connectToNetwork(network.ssid, password);
      if (response.success) {
        onSuccess(response);
      } else {
        setError(response.error || "Connection failed. Check your password and try again.");
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to connect. Make sure the backend is running."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-4 rounded-xl border border-slate-700/50 bg-bg-surface/50 p-5 backdrop-blur-sm"
    >
      <div className="mb-4">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-sm font-medium text-text-primary">
            Connect to{" "}
            <span className="text-accent">{network.ssid}</span>
          </h3>
          <button
            type="button"
            onClick={onCancel}
            className="text-xs text-text-secondary hover:text-text-primary transition-colors"
          >
            Cancel
          </button>
        </div>
        <p className="text-xs text-text-secondary">
          Channel {network.channel} &middot; {network.rssi} dBm
        </p>
      </div>

      <div className="relative mb-4">
        <input
          type={showPassword ? "text" : "password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Enter WiFi password"
          autoFocus
          className="w-full rounded-lg border border-slate-600/50 bg-slate-800/80 px-4 py-3 pr-20 text-sm text-text-primary placeholder-text-secondary/60 outline-none focus:border-accent focus:ring-1 focus:ring-accent/50 transition-all"
        />
        <button
          type="button"
          onClick={() => setShowPassword(!showPassword)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-text-secondary hover:text-text-primary transition-colors"
        >
          {showPassword ? "Hide" : "Show"}
        </button>
      </div>

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-lg bg-red-500/10 border border-red-500/20 p-3">
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
          <div>
            <p className="text-sm text-error">{error}</p>
            <button
              type="button"
              onClick={() => setError(null)}
              className="mt-1 text-xs text-red-400/80 hover:text-red-300 underline"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      <button
        type="submit"
        disabled={loading || !password}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 py-3 text-sm font-semibold text-white transition-all hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? (
          <>
            <svg
              className="h-4 w-4 animate-spin"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            Connecting...
          </>
        ) : (
          <>
            <svg
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 10V3L4 14h7v7l9-11h-7z"
              />
            </svg>
            Connect
          </>
        )}
      </button>
    </form>
  );
}
