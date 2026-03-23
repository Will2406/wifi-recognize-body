"""
WiFi Sense Lab — Backend Main Entry Point

FastAPI application that:
- Reads CSI data from ESP32 via bidirectional serial
- Parses raw I/Q pairs and computes amplitude + phase
- Feeds CSI into SignalProcessor / PresenceDetector pipeline
- Exposes REST API for WiFi management (scan, connect, status, reset)
- Exposes REST API for calibration and detection state
- Broadcasts real-time CSI data and detection results via Socket.IO
- Serves as the ASGI app entry point (uvicorn)

Usage:
    cd backend && python main.py
    # or: uvicorn main:socket_app --host 0.0.0.0 --port 8000
"""

import asyncio
import logging
import math
import os

import yaml
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import socketio

from serial_reader import SerialReader
from detector import PresenceDetector
from data_logger import DataLogger
import wifi_manager

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

config_path = os.path.join(os.path.dirname(__file__), "..", "config", "settings.yaml")
with open(config_path) as f:
    config = yaml.safe_load(f)

# ---------------------------------------------------------------------------
# Socket.IO server
# ---------------------------------------------------------------------------

sio = socketio.AsyncServer(async_mode='asgi', cors_allowed_origins='*')

# ---------------------------------------------------------------------------
# Serial reader instance
# ---------------------------------------------------------------------------

reader = SerialReader(
    port=config['serial']['port'],
    baud_rate=config['serial']['baud_rate'],
)

# ---------------------------------------------------------------------------
# Signal processing & detection
# ---------------------------------------------------------------------------

detection_config = config.get('detection', {})
detector = PresenceDetector(
    threshold=detection_config.get('threshold', 3.0),
    calibration_seconds=detection_config.get('calibration_seconds', 30.0),
    num_subcarriers=detection_config.get('num_subcarriers', 64),
    sample_rate=detection_config.get('sample_rate', 50.0),
    buffer_seconds=detection_config.get('buffer_seconds', 10),
    movement_thresholds=detection_config.get('movement_thresholds', {'quiet': 5, 'light': 30}),
    num_selected_subcarriers=detection_config.get('num_selected_subcarriers', 12),
    mvs_window_seconds=detection_config.get('mvs_window_seconds', 2.0),
    threshold_multiplier=detection_config.get('threshold_multiplier', 1.4),
)

# ---------------------------------------------------------------------------
# Data logger
# ---------------------------------------------------------------------------

data_logger = DataLogger()

# ---------------------------------------------------------------------------
# Serial callbacks — bridge threaded serial reads to async Socket.IO emits
# ---------------------------------------------------------------------------

loop = None  # Will be set in lifespan

# Throttle detection result emission to avoid flooding WebSocket
_last_detection_emit: float = 0.0
_DETECTION_EMIT_INTERVAL: float = 0.25  # seconds

# MAC filter for defense-in-depth (firmware handles primary filtering)
_mac_filter: str = detection_config.get('mac_filter', 'auto')


def on_csi(line: str):
    """Parse CSI line with raw I/Q pairs, compute amplitude/phase,
    feed into detector, and broadcast via Socket.IO."""
    global _last_detection_emit

    parts = line.split(',')
    # New format: CSI,ts,mac,rssi,ch,num_sub,imag0,real0,imag1,real1,...
    if len(parts) < 7:
        return

    try:
        timestamp = int(parts[1])
        mac_src = parts[2]
        rssi = int(parts[3])
        channel = int(parts[4])
        num_subcarriers = int(parts[5])
    except (ValueError, IndexError):
        return

    # Defense-in-depth MAC filter (firmware handles primary filtering)
    if _mac_filter and _mac_filter.lower() != 'auto':
        if mac_src.upper() != _mac_filter.upper():
            return

    # Parse I/Q pairs
    iq_values = parts[6:]
    # We expect 2 * num_subcarriers values (imag, real pairs)
    expected_count = num_subcarriers * 2
    if len(iq_values) < expected_count:
        # Use what we have (partial data)
        expected_count = (len(iq_values) // 2) * 2

    amplitudes = []
    phases = []
    raw_iq = []

    for i in range(0, expected_count, 2):
        try:
            imag = int(iq_values[i])
            real = int(iq_values[i + 1])
        except (ValueError, IndexError):
            break

        raw_iq.append(imag)
        raw_iq.append(real)

        amplitude = math.sqrt(real * real + imag * imag)
        phase = math.atan2(imag, real)

        amplitudes.append(amplitude)
        phases.append(phase)

    if not amplitudes:
        return

    # Build CSI data payload (backward-compatible: amplitudes still present)
    csi_data = {
        'timestamp': timestamp,
        'mac_src': mac_src,
        'rssi': rssi,
        'channel': channel,
        'num_subcarriers': len(amplitudes),
        'amplitudes': amplitudes,
        'phases': phases,
        'raw_iq': raw_iq,
    }

    # Feed into detection pipeline
    detection_result = detector.update(amplitudes, phases, timestamp)

    # Log if recording
    data_logger.log(timestamp, mac_src, rssi, channel, len(amplitudes), amplitudes, phases)

    if loop:
        # Emit CSI data
        asyncio.run_coroutine_threadsafe(
            sio.emit('csi_data', csi_data),
            loop,
        )

        # Emit detection result (throttled)
        import time as _time
        now = _time.time()
        if now - _last_detection_emit >= _DETECTION_EMIT_INTERVAL:
            _last_detection_emit = now
            detection_payload = {
                'timestamp': timestamp,
                'presence': detection_result.get('presence', False),
                'movement': detection_result.get('movement', 0.0),
                'movement_label': detection_result.get('movement_label', 'quiet'),
                'variance_ratio': detection_result.get('variance_ratio', 0.0),
                'spatial_turbulence': detection_result.get('spatial_turbulence', 0.0),
                'moving_variance': detection_result.get('moving_variance', 0.0),
                'adaptive_threshold': detection_result.get('adaptive_threshold'),
                'baseline_p95_mv': detection_result.get('baseline_p95_mv'),
                'calibrated': detection_result.get('calibrated', False),
                'calibrating': detection_result.get('calibrating', False),
            }
            asyncio.run_coroutine_threadsafe(
                sio.emit('detection_result', detection_payload),
                loop,
            )


def on_heartbeat(line: str):
    """Broadcast ESP32 status on heartbeat."""
    if loop:
        asyncio.run_coroutine_threadsafe(
            sio.emit('esp32_status', reader.esp32_status),
            loop,
        )


reader.on_csi = on_csi
reader.on_heartbeat = on_heartbeat

# ---------------------------------------------------------------------------
# FastAPI lifespan — connect/disconnect serial
# ---------------------------------------------------------------------------


@asynccontextmanager
async def lifespan(app: FastAPI):
    global loop
    loop = asyncio.get_event_loop()

    # Try to connect to ESP32
    port = reader.port
    logging.info(f"Connecting to ESP32 on {port}...")
    if reader.connect():
        logging.info("ESP32 serial connected!")
        # Send MAC filter command if a specific MAC is configured
        mac_filter_cfg = detection_config.get('mac_filter', 'auto')
        if mac_filter_cfg and mac_filter_cfg.lower() != 'auto':
            logging.info(f"Sending MAC filter to ESP32: {mac_filter_cfg}")
            result = reader.set_mac_filter(mac_filter_cfg)
            if result.get('success'):
                logging.info(f"MAC filter active: {result.get('mac')}")
            else:
                logging.warning(f"MAC filter command failed: {result.get('error', 'unknown')}")
    else:
        logging.warning(f"ESP32 not found on {port} — will retry on API calls")

    # Start traffic generator: ping ESP32 to generate CSI data
    import subprocess
    ping_proc = None
    # Wait up to 10 seconds for ESP32 WiFi status to sync
    for _ in range(20):
        esp32_ip = reader.esp32_status.get('ip')
        if esp32_ip:
            break
        await asyncio.sleep(0.5)
    if esp32_ip:
        logging.info(f"Starting CSI traffic generator: ping -i 0.02 {esp32_ip}")
        ping_proc = subprocess.Popen(
            ['ping', '-i', '0.02', esp32_ip],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
    else:
        logging.warning("No ESP32 IP — traffic generator not started")

    yield

    # Cleanup
    if ping_proc:
        ping_proc.terminate()
        logging.info("Traffic generator stopped")
    reader.disconnect()
    logging.info("Backend shutdown complete")

# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------

app = FastAPI(title="WiFi Sense Lab", lifespan=lifespan)

# CORS — allow Next.js frontend
cors_origins = config.get('server', {}).get('cors_origins', [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
])
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount WiFi router — inject serial reader
wifi_manager.serial_reader = reader
app.include_router(wifi_manager.router)


# Health endpoint
@app.get("/api/health")
async def health():
    """Health check — returns ESP32 connection state."""
    return {
        "status": "ok",
        "esp32_connected": reader.connected,
        "esp32_status": reader.esp32_status,
    }


# ---------------------------------------------------------------------------
# Detection & Calibration endpoints
# ---------------------------------------------------------------------------

@app.post("/api/calibrate")
async def start_calibration():
    """Start baseline calibration (room should be empty)."""
    detector.start_calibration()
    return {
        "status": "calibrating",
        "seconds": detector.calibration_seconds,
        "message": f"Calibrating for {detector.calibration_seconds}s — ensure the room is empty.",
    }


@app.get("/api/detection")
async def get_detection():
    """Get current detection state."""
    return detector.get_state()


# ---------------------------------------------------------------------------
# Recording endpoints
# ---------------------------------------------------------------------------

@app.post("/api/recording/start")
async def start_recording(label: str = None):
    """Start recording CSI data to CSV."""
    return data_logger.start(label)


@app.post("/api/recording/stop")
async def stop_recording():
    """Stop recording CSI data."""
    return data_logger.stop()


@app.get("/api/recording/status")
async def recording_status():
    """Get current recording status."""
    return data_logger.get_status()


# ---------------------------------------------------------------------------
# Socket.IO ASGI app (wraps FastAPI)
# ---------------------------------------------------------------------------

socket_app = socketio.ASGIApp(sio, app)


@sio.event
async def connect(sid, environ):
    logging.info(f"WebSocket client connected: {sid}")
    await sio.emit('esp32_status', reader.esp32_status, to=sid)


@sio.event
async def disconnect(sid):
    logging.info(f"WebSocket client disconnected: {sid}")

# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import uvicorn

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )

    host = config.get('server', {}).get('host', '0.0.0.0')
    port = config.get('server', {}).get('port', 8000)
    uvicorn.run(socket_app, host=host, port=port)
