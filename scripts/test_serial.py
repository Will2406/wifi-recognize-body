#!/usr/bin/env python3
"""
WiFi Sense Lab — Serial Test Script

Connects to ESP32 serial port, reads CSI data, validates format,
and prints throughput statistics.

Usage:
    python scripts/test_serial.py --port /dev/cu.usbserial-0001
    python scripts/test_serial.py --port /dev/cu.usbserial-0001 --save data.csv
    python scripts/test_serial.py --config config/settings.yaml
"""

import argparse
import sys
import time
from collections import deque

import serial
import yaml


def load_config(config_path: str) -> dict:
    """Load settings from YAML config file."""
    with open(config_path, "r") as f:
        return yaml.safe_load(f)


def parse_csi_line(line: str) -> dict | None:
    """
    Parse a CSI CSV line into a structured dict.

    Expected format:
        CSI,<timestamp_ms>,<mac_src>,<rssi>,<channel>,<num_subcarriers>,<amp1>,<amp2>,...

    Returns dict with keys: timestamp, mac, rssi, channel, num_subcarriers, amplitudes
    Returns None if line is not a valid CSI line.
    """
    if not line.startswith("CSI,"):
        return None

    parts = line.strip().split(",")

    try:
        num_subcarriers = int(parts[5])
        expected_len = 6 + num_subcarriers

        if len(parts) < expected_len:
            return None

        amplitudes = [int(parts[6 + i]) for i in range(num_subcarriers)]

        return {
            "timestamp": int(parts[1]),
            "mac": parts[2],
            "rssi": int(parts[3]),
            "channel": int(parts[4]),
            "num_subcarriers": num_subcarriers,
            "amplitudes": amplitudes,
        }
    except (ValueError, IndexError):
        return None


def parse_ap_line(line: str) -> dict | None:
    """
    Parse an AP scan line.

    Expected format:
        AP,<index>,<ssid>,<mac>,<rssi>,<channel>
    """
    if not line.startswith("AP,"):
        return None

    parts = line.strip().split(",")
    if len(parts) < 6:
        return None

    try:
        return {
            "index": int(parts[1]),
            "ssid": parts[2],
            "mac": parts[3],
            "rssi": int(parts[4]),
            "channel": int(parts[5]),
        }
    except (ValueError, IndexError):
        return None


def main():
    parser = argparse.ArgumentParser(
        description="WiFi Sense Lab — Serial Test Script"
    )
    parser.add_argument(
        "--port",
        type=str,
        help="Serial port (e.g., /dev/cu.usbserial-0001)",
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
        help="Path to settings.yaml (overrides --port and --baud)",
    )
    parser.add_argument(
        "--save",
        type=str,
        default=None,
        help="Save CSI lines to a CSV file",
    )
    parser.add_argument(
        "--duration",
        type=int,
        default=0,
        help="Run for N seconds then stop (0 = run forever)",
    )

    args = parser.parse_args()

    # Load config if provided
    port = args.port
    baud = args.baud

    if args.config:
        cfg = load_config(args.config)
        port = cfg.get("serial", {}).get("port", port)
        baud = cfg.get("serial", {}).get("baud_rate", baud)

    if not port:
        print("ERROR: No serial port specified. Use --port or --config.")
        sys.exit(1)

    print(f"WiFi Sense Lab — Serial Test")
    print(f"Port: {port}")
    print(f"Baud: {baud}")
    print(f"{'Saving to: ' + args.save if args.save else 'Not saving to file'}")
    print("-" * 60)

    # Open save file if requested
    save_file = None
    if args.save:
        save_file = open(args.save, "w")
        save_file.write("timestamp,mac,rssi,channel,num_subcarriers,amplitudes\n")

    try:
        ser = serial.Serial(port, baud, timeout=2)
        print(f"Connected to {port}")
    except serial.SerialException as e:
        print(f"ERROR: Could not open serial port: {e}")
        sys.exit(1)

    # Statistics tracking
    csi_count = 0
    ap_count = 0
    info_count = 0
    error_count = 0
    start_time = time.time()
    window = deque(maxlen=100)  # Track last 100 packets for pps calculation

    try:
        while True:
            # Check duration limit
            elapsed = time.time() - start_time
            if args.duration > 0 and elapsed > args.duration:
                print(f"\nDuration limit ({args.duration}s) reached.")
                break

            # Read line from serial
            try:
                raw = ser.readline()
                if not raw:
                    continue
                line = raw.decode("utf-8", errors="replace").strip()
            except Exception as e:
                error_count += 1
                if error_count <= 10:
                    print(f"  [READ ERROR] {e}")
                continue

            if not line:
                continue

            # Parse and handle different line types
            if line.startswith("CSI,"):
                csi = parse_csi_line(line)
                if csi:
                    csi_count += 1
                    now = time.time()
                    window.append(now)

                    # Calculate packets per second over the window
                    if len(window) >= 2:
                        dt = window[-1] - window[0]
                        pps = (len(window) - 1) / dt if dt > 0 else 0
                    else:
                        pps = 0

                    # Print summary every 50 packets
                    if csi_count % 50 == 0:
                        print(
                            f"  [CSI #{csi_count}] "
                            f"mac={csi['mac']} "
                            f"rssi={csi['rssi']}dBm "
                            f"ch={csi['channel']} "
                            f"subs={csi['num_subcarriers']} "
                            f"pps={pps:.1f} "
                            f"amps_sample={csi['amplitudes'][:5]}..."
                        )

                    # Save to file
                    if save_file:
                        amp_str = ";".join(str(a) for a in csi["amplitudes"])
                        save_file.write(
                            f"{csi['timestamp']},{csi['mac']},"
                            f"{csi['rssi']},{csi['channel']},"
                            f"{csi['num_subcarriers']},{amp_str}\n"
                        )
                else:
                    error_count += 1
                    if error_count <= 20:
                        print(f"  [PARSE ERROR] {line[:80]}")

            elif line.startswith("AP,"):
                ap = parse_ap_line(line)
                if ap:
                    ap_count += 1
                    print(
                        f"  [AP] #{ap['index']} "
                        f"SSID={ap['ssid']} "
                        f"MAC={ap['mac']} "
                        f"RSSI={ap['rssi']}dBm "
                        f"CH={ap['channel']}"
                    )

            elif line.startswith("INFO,"):
                info_count += 1
                print(f"  {line}")

            else:
                # Unknown line type — print as-is
                print(f"  [RAW] {line}")

    except KeyboardInterrupt:
        print("\n\nInterrupted by user.")

    finally:
        elapsed = time.time() - start_time
        avg_pps = csi_count / elapsed if elapsed > 0 else 0

        print()
        print("=" * 60)
        print("SESSION SUMMARY")
        print("=" * 60)
        print(f"  Duration:     {elapsed:.1f} seconds")
        print(f"  CSI packets:  {csi_count}")
        print(f"  AP entries:   {ap_count}")
        print(f"  Info lines:   {info_count}")
        print(f"  Errors:       {error_count}")
        print(f"  Avg CSI rate: {avg_pps:.1f} pkt/s")
        print()

        # Throughput validation
        if csi_count > 0:
            if avg_pps >= 50:
                print("  THROUGHPUT: EXCELLENT (>= 50 pkt/s)")
            elif avg_pps >= 20:
                print("  THROUGHPUT: GOOD (>= 20 pkt/s, meets minimum requirement)")
            elif avg_pps >= 10:
                print("  THROUGHPUT: LOW (10-20 pkt/s, may affect detection quality)")
            else:
                print("  THROUGHPUT: VERY LOW (< 10 pkt/s, check WiFi traffic)")
        else:
            print("  THROUGHPUT: No CSI packets received")
            print("  Check: WiFi credentials, serial connection, firmware upload")

        ser.close()
        if save_file:
            save_file.close()
            print(f"  Data saved to: {args.save}")


if __name__ == "__main__":
    main()
