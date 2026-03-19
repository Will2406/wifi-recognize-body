#!/usr/bin/env python3
"""
WiFi Sense Lab — CSI Plotter

Real-time or offline visualization of CSI subcarrier amplitudes.

Modes:
  1. Live mode: Read from ESP32 serial port and plot in real-time
  2. File mode: Read from a saved CSV file and plot

Usage:
    python scripts/plot_csi.py --port /dev/cu.usbserial-0001
    python scripts/plot_csi.py --file data.csv
    python scripts/plot_csi.py --config config/settings.yaml
"""

import argparse
import sys
import time
from collections import deque

import matplotlib
import matplotlib.pyplot as plt
import matplotlib.animation as animation
import numpy as np
import serial
import yaml


def load_config(config_path: str) -> dict:
    """Load settings from YAML config file."""
    with open(config_path, "r") as f:
        return yaml.safe_load(f)


def parse_csi_line(line: str) -> dict | None:
    """
    Parse a CSI CSV line.

    Format: CSI,<timestamp_ms>,<mac_src>,<rssi>,<channel>,<num_subcarriers>,<amp1>,<amp2>,...
    """
    if not line.startswith("CSI,"):
        return None

    parts = line.strip().split(",")
    try:
        num_sub = int(parts[5])
        if len(parts) < 6 + num_sub:
            return None
        amplitudes = [int(parts[6 + i]) for i in range(num_sub)]
        return {
            "timestamp": int(parts[1]),
            "mac": parts[2],
            "rssi": int(parts[3]),
            "channel": int(parts[4]),
            "num_subcarriers": num_sub,
            "amplitudes": amplitudes,
        }
    except (ValueError, IndexError):
        return None


class LiveCSIPlotter:
    """Real-time CSI amplitude plotter using matplotlib animation."""

    def __init__(self, port: str, baud: int, max_history: int = 300):
        self.port = port
        self.baud = baud
        self.max_history = max_history  # Max number of frames to keep in history

        # Data storage
        self.current_amplitudes = None
        self.amplitude_history = deque(maxlen=max_history)
        self.rssi_history = deque(maxlen=max_history)
        self.timestamps = deque(maxlen=max_history)
        self.packet_count = 0

        # Serial connection
        self.ser = None

        # Setup the figure with 3 subplots
        self.fig, (self.ax_bar, self.ax_time, self.ax_rssi) = plt.subplots(
            3, 1, figsize=(12, 9)
        )
        self.fig.suptitle("WiFi Sense Lab — Live CSI Monitor", fontsize=14)

        # Bar chart: current subcarrier amplitudes
        self.ax_bar.set_title("Current CSI Amplitudes by Subcarrier")
        self.ax_bar.set_xlabel("Subcarrier Index")
        self.ax_bar.set_ylabel("Amplitude")
        self.ax_bar.set_ylim(0, 50)

        # Time series: amplitude of selected subcarriers over time
        self.ax_time.set_title("Amplitude Over Time (selected subcarriers)")
        self.ax_time.set_xlabel("Packet #")
        self.ax_time.set_ylabel("Amplitude")

        # RSSI over time
        self.ax_rssi.set_title("RSSI Over Time")
        self.ax_rssi.set_xlabel("Packet #")
        self.ax_rssi.set_ylabel("RSSI (dBm)")

        self.fig.tight_layout(rect=[0, 0, 1, 0.95])

    def connect(self):
        """Open serial connection."""
        try:
            self.ser = serial.Serial(self.port, self.baud, timeout=0.1)
            print(f"Connected to {self.port} at {self.baud} baud")
            return True
        except serial.SerialException as e:
            print(f"ERROR: Could not open serial port: {e}")
            return False

    def read_serial_data(self):
        """Read and parse available CSI data from serial."""
        if not self.ser or not self.ser.is_open:
            return

        # Read all available lines (non-blocking with short timeout)
        while self.ser.in_waiting > 0:
            try:
                raw = self.ser.readline()
                if not raw:
                    break
                line = raw.decode("utf-8", errors="replace").strip()
                csi = parse_csi_line(line)
                if csi:
                    self.current_amplitudes = np.array(csi["amplitudes"], dtype=float)
                    self.amplitude_history.append(self.current_amplitudes.copy())
                    self.rssi_history.append(csi["rssi"])
                    self.timestamps.append(self.packet_count)
                    self.packet_count += 1
            except Exception:
                pass

    def update(self, frame):
        """Animation update function — called periodically by FuncAnimation."""
        self.read_serial_data()

        if self.current_amplitudes is None:
            return

        num_sub = len(self.current_amplitudes)

        # --- Bar chart: current amplitudes ---
        self.ax_bar.clear()
        self.ax_bar.bar(
            range(num_sub),
            self.current_amplitudes,
            color="steelblue",
            alpha=0.8,
        )
        self.ax_bar.set_title(
            f"Current CSI Amplitudes (packet #{self.packet_count})"
        )
        self.ax_bar.set_xlabel("Subcarrier Index")
        self.ax_bar.set_ylabel("Amplitude")
        self.ax_bar.set_ylim(0, max(50, self.current_amplitudes.max() * 1.2))

        # --- Time series: selected subcarriers ---
        if len(self.amplitude_history) > 1:
            self.ax_time.clear()
            history_array = np.array(list(self.amplitude_history))
            ts = list(self.timestamps)

            # Plot 4 representative subcarriers (evenly spaced)
            indices = np.linspace(0, num_sub - 1, 4, dtype=int)
            colors = ["#e41a1c", "#377eb8", "#4daf4a", "#984ea3"]

            for idx, color in zip(indices, colors):
                self.ax_time.plot(
                    ts,
                    history_array[:, idx],
                    label=f"Sub {idx}",
                    color=color,
                    alpha=0.8,
                    linewidth=1,
                )

            self.ax_time.set_title("Amplitude Over Time (selected subcarriers)")
            self.ax_time.set_xlabel("Packet #")
            self.ax_time.set_ylabel("Amplitude")
            self.ax_time.legend(loc="upper right", fontsize=8)
            self.ax_time.grid(True, alpha=0.3)

        # --- RSSI over time ---
        if len(self.rssi_history) > 1:
            self.ax_rssi.clear()
            ts = list(self.timestamps)
            rssi_vals = list(self.rssi_history)

            self.ax_rssi.plot(ts, rssi_vals, color="darkorange", linewidth=1)
            self.ax_rssi.set_title("RSSI Over Time")
            self.ax_rssi.set_xlabel("Packet #")
            self.ax_rssi.set_ylabel("RSSI (dBm)")
            self.ax_rssi.grid(True, alpha=0.3)

        self.fig.tight_layout(rect=[0, 0, 1, 0.95])

    def run(self):
        """Start the live plot."""
        if not self.connect():
            sys.exit(1)

        ani = animation.FuncAnimation(
            self.fig, self.update, interval=100, cache_frame_data=False
        )
        plt.show()

        if self.ser and self.ser.is_open:
            self.ser.close()


def plot_from_file(filepath: str):
    """
    Plot CSI data from a saved CSV file.

    Expected CSV format (as saved by test_serial.py):
        timestamp,mac,rssi,channel,num_subcarriers,amplitudes
        12345,AA:BB:CC:DD:EE:FF,-45,6,64,10;12;15;...
    """
    print(f"Loading data from: {filepath}")

    timestamps = []
    rssi_values = []
    all_amplitudes = []

    with open(filepath, "r") as f:
        header = f.readline()  # Skip header
        for line in f:
            parts = line.strip().split(",")
            if len(parts) < 6:
                continue
            try:
                timestamps.append(int(parts[0]))
                rssi_values.append(int(parts[2]))
                amps = [int(a) for a in parts[5].split(";")]
                all_amplitudes.append(amps)
            except (ValueError, IndexError):
                continue

    if not all_amplitudes:
        print("ERROR: No valid CSI data found in file.")
        sys.exit(1)

    print(f"Loaded {len(all_amplitudes)} CSI packets")

    # Ensure all amplitude arrays have the same length
    max_len = max(len(a) for a in all_amplitudes)
    for i in range(len(all_amplitudes)):
        if len(all_amplitudes[i]) < max_len:
            all_amplitudes[i].extend([0] * (max_len - len(all_amplitudes[i])))

    amp_array = np.array(all_amplitudes)

    # Create figure with 3 subplots
    fig, (ax1, ax2, ax3) = plt.subplots(3, 1, figsize=(14, 10))
    fig.suptitle(f"WiFi Sense Lab — CSI Data ({filepath})", fontsize=14)

    # 1. Average amplitude by subcarrier
    avg_amps = amp_array.mean(axis=0)
    std_amps = amp_array.std(axis=0)
    x = range(len(avg_amps))

    ax1.bar(x, avg_amps, yerr=std_amps, color="steelblue", alpha=0.8,
            capsize=2, error_kw={"linewidth": 0.5})
    ax1.set_title("Average Amplitude by Subcarrier")
    ax1.set_xlabel("Subcarrier Index")
    ax1.set_ylabel("Amplitude (mean +/- std)")

    # 2. Heatmap: amplitude over time (subcarrier x packet)
    im = ax2.imshow(
        amp_array.T,
        aspect="auto",
        cmap="viridis",
        origin="lower",
        interpolation="nearest",
    )
    ax2.set_title("CSI Amplitude Heatmap (Subcarrier vs. Packet)")
    ax2.set_xlabel("Packet #")
    ax2.set_ylabel("Subcarrier Index")
    fig.colorbar(im, ax=ax2, label="Amplitude")

    # 3. RSSI over time
    ax3.plot(rssi_values, color="darkorange", linewidth=0.8)
    ax3.set_title("RSSI Over Time")
    ax3.set_xlabel("Packet #")
    ax3.set_ylabel("RSSI (dBm)")
    ax3.grid(True, alpha=0.3)

    fig.tight_layout(rect=[0, 0, 1, 0.95])
    plt.show()


def main():
    parser = argparse.ArgumentParser(
        description="WiFi Sense Lab — CSI Plotter"
    )
    group = parser.add_mutually_exclusive_group()
    group.add_argument(
        "--port",
        type=str,
        help="Serial port for live mode (e.g., /dev/cu.usbserial-0001)",
    )
    group.add_argument(
        "--file",
        type=str,
        help="CSV file path for offline mode",
    )
    parser.add_argument(
        "--baud",
        type=int,
        default=921600,
        help="Baud rate (default: 921600)",
    )
    parser.add_argument(
        "--config",
        type=str,
        default=None,
        help="Path to settings.yaml",
    )

    args = parser.parse_args()

    # Load config if provided
    port = args.port
    baud = args.baud

    if args.config:
        cfg = load_config(args.config)
        port = port or cfg.get("serial", {}).get("port")
        baud = cfg.get("serial", {}).get("baud_rate", baud)

    if args.file:
        plot_from_file(args.file)
    elif port:
        plotter = LiveCSIPlotter(port, baud)
        plotter.run()
    else:
        print("ERROR: Specify --port for live mode or --file for offline mode.")
        print("       Or use --config to load settings from YAML.")
        sys.exit(1)


if __name__ == "__main__":
    main()
