"""
WiFi Sense Lab — WebSocket Server Module

python-socketio ASGI server that:
- Broadcasts real-time detection results to connected clients
- Emits JSON: {ts, presence, movement, movement_label, rssi, csi_amplitudes, variance_ratio}
- Handles client connection/disconnection
- Supports room-based event filtering

Phase 2 implementation.
"""
