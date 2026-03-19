"""
WiFi Sense Lab — WebSocket Server Module

NOTE: Socket.IO is handled directly in main.py using python-socketio's
AsyncServer mounted as an ASGI app. This module is reserved for future
extraction if the WebSocket logic grows complex enough to warrant separation.

Current Socket.IO events (defined in main.py):
- 'csi_data'      — Real-time CSI amplitudes from ESP32
- 'esp32_status'   — ESP32 connection state (heartbeat-driven)

Phase 2 will add:
- 'detection'      — Presence/movement detection results
- Room-based event filtering
"""
