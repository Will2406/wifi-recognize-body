import type {
  WiFiNetwork,
  WiFiConnectResponse,
  ESP32Status,
} from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

async function apiFetch<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
    ...options,
  });

  if (!res.ok) {
    const errorBody = await res.text().catch(() => "Unknown error");
    throw new Error(`API error ${res.status}: ${errorBody}`);
  }

  return res.json();
}

export async function fetchNetworks(): Promise<WiFiNetwork[]> {
  return apiFetch<WiFiNetwork[]>("/api/wifi/scan");
}

export async function connectToNetwork(
  ssid: string,
  password: string
): Promise<WiFiConnectResponse> {
  return apiFetch<WiFiConnectResponse>("/api/wifi/connect", {
    method: "POST",
    body: JSON.stringify({ ssid, password }),
  });
}

export async function getWiFiStatus(): Promise<ESP32Status> {
  return apiFetch<ESP32Status>("/api/wifi/status");
}

export async function resetWiFi(): Promise<{ success: boolean }> {
  return apiFetch<{ success: boolean }>("/api/wifi/reset", {
    method: "POST",
  });
}

export async function getHealth(): Promise<{
  status: string;
  serial_connected: boolean;
  wifi_connected: boolean;
}> {
  return apiFetch("/api/health");
}
