"""
WiFi Sense Lab — Backend Main Entry Point

FastAPI application that:
- Reads CSI data from ESP32 via bidirectional serial
- Exposes REST API for WiFi management (scan, connect, status, reset)
- Broadcasts real-time CSI data and ESP32 status via Socket.IO
- Serves as the ASGI app entry point (uvicorn)

Usage:
    cd backend && python main.py
    # or: uvicorn main:socket_app --host 0.0.0.0 --port 8000
"""

import asyncio
import logging
import os

import yaml
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import socketio

from serial_reader import SerialReader
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
# Serial callbacks — bridge threaded serial reads to async Socket.IO emits
# ---------------------------------------------------------------------------

loop = None  # Will be set in lifespan


def on_csi(line: str):
    """Parse CSI line and broadcast via Socket.IO."""
    parts = line.split(',')
    if len(parts) >= 6:
        data = {
            'timestamp': int(parts[1]),
            'mac_src': parts[2],
            'rssi': int(parts[3]),
            'channel': int(parts[4]),
            'num_subcarriers': int(parts[5]),
            'amplitudes': [int(x) for x in parts[6:] if x.strip()],
        }
        if loop:
            asyncio.run_coroutine_threadsafe(
                sio.emit('csi_data', data),
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
    else:
        logging.warning(f"ESP32 not found on {port} — will retry on API calls")

    yield

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
