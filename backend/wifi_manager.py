"""
WiFi Sense Lab — WiFi Manager Module

FastAPI APIRouter providing REST endpoints for WiFi management via ESP32:
- GET  /api/wifi/scan     — Scan available networks
- POST /api/wifi/connect  — Connect to a network
- GET  /api/wifi/status   — Get current WiFi status
- POST /api/wifi/reset    — Reset WiFi credentials

All operations are proxied to the ESP32 via serial commands.
The serial_reader instance is injected by main.py at startup.
"""

import logging
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/wifi", tags=["wifi"])

# Serial reader instance — set by main.py during initialization
serial_reader = None


class WiFiConnectRequest(BaseModel):
    ssid: str
    password: str


@router.get("/scan")
async def scan_networks():
    """Scan for available WiFi networks via ESP32."""
    if not serial_reader or not serial_reader.connected:
        raise HTTPException(status_code=503, detail="ESP32 not connected via serial")
    networks = serial_reader.wifi_scan()
    return networks


@router.post("/connect")
async def connect_network(req: WiFiConnectRequest):
    """Connect ESP32 to a WiFi network."""
    if not serial_reader or not serial_reader.connected:
        raise HTTPException(status_code=503, detail="ESP32 not connected via serial")
    result = serial_reader.wifi_connect(req.ssid, req.password)
    return result


@router.get("/status")
async def wifi_status():
    """Get current WiFi connection status from ESP32."""
    if not serial_reader or not serial_reader.connected:
        return {"connected": False, "serial_connected": False}
    status = serial_reader.wifi_status()
    status["serial_connected"] = True
    return status


@router.post("/reset")
async def reset_wifi():
    """Reset WiFi credentials on ESP32 (clear NVS)."""
    if not serial_reader or not serial_reader.connected:
        raise HTTPException(status_code=503, detail="ESP32 not connected via serial")
    success = serial_reader.wifi_reset()
    return {"success": success}
