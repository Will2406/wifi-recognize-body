"""
WiFi Sense Lab — Serial Reader Module

Connects to ESP32 via USB serial at 921600 baud.
Parses CSI CSV lines into structured data (numpy arrays).
Runs in a background thread to avoid blocking the async event loop.

Phase 2 implementation.
"""
