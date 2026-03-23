export interface ESP32Status {
  serial_connected: boolean;
  wifi_connected: boolean;
  ssid: string | null;
  ip: string | null;
  rssi: number | null;
  channel: number | null;
  csi_active: boolean;
  packets_per_second: number;
  free_heap: number;
}

export interface WiFiNetwork {
  ssid: string;
  mac: string;
  rssi: number;
  channel: number;
}

export interface CSIData {
  timestamp: number;
  mac_src: string;
  rssi: number;
  channel: number;
  num_subcarriers: number;
  amplitudes: number[];
  phases: number[];
  raw_iq?: number[];
}

export interface DetectionResult {
  timestamp: number;
  presence: boolean;
  movement: number;
  movement_label: "quiet" | "light" | "strong";
  variance_ratio: number;
}

export interface WiFiConnectRequest {
  ssid: string;
  password: string;
}

export interface WiFiConnectResponse {
  success: boolean;
  ip?: string;
  channel?: number;
  bssid?: string;
  error?: string;
}
