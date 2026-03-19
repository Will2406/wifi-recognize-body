"""
WiFi Sense Lab — Serial Reader Module

Bidirectional serial communication with ESP32 at 921600 baud.
- Background read thread routes incoming lines by prefix (CSI, AP, RSP, HB, INFO)
- send_command() / send_command_multiline() for command-response pattern
- High-level methods: wifi_scan(), wifi_connect(), wifi_status(), wifi_reset()
- Thread-safe command dispatch with Event-based response waiting
"""

import serial
import threading
import asyncio
import base64
import logging
import time
from typing import Optional, Callable

logger = logging.getLogger(__name__)


class SerialReader:
    def __init__(self, port: str, baud_rate: int = 921600):
        self.port = port
        self.baud_rate = baud_rate
        self.serial: Optional[serial.Serial] = None
        self.running = False
        self.read_thread: Optional[threading.Thread] = None

        # Callbacks by prefix
        self.on_csi: Optional[Callable] = None        # CSI,... lines
        self.on_ap: Optional[Callable] = None          # AP,... lines
        self.on_info: Optional[Callable] = None        # INFO,... lines
        self.on_heartbeat: Optional[Callable] = None   # HB,... lines

        # Command response handling
        self._response_event = threading.Event()
        self._response_data: Optional[str] = None
        self._pending_lines: list = []  # Buffer for multi-line responses (AP scan)
        self._lock = threading.Lock()

        # Status
        self.connected = False
        self.esp32_status = {
            'serial_connected': False,
            'wifi_connected': False,
            'ssid': None,
            'ip': None,
            'rssi': None,
            'channel': None,
            'csi_active': False,
            'packets_per_second': 0,
            'free_heap': 0,
        }

    def connect(self) -> bool:
        """Open serial connection to ESP32."""
        try:
            self.serial = serial.Serial(self.port, self.baud_rate, timeout=1)
            self.connected = True
            self.esp32_status['serial_connected'] = True
            self.running = True
            self.read_thread = threading.Thread(target=self._read_loop, daemon=True)
            self.read_thread.start()
            logger.info(f"Serial connected on {self.port} at {self.baud_rate} baud")
            return True
        except Exception as e:
            logger.error(f"Serial connect failed: {e}")
            self.connected = False
            self.esp32_status['serial_connected'] = False
            return False

    def disconnect(self):
        """Close serial connection."""
        self.running = False
        if self.read_thread:
            self.read_thread.join(timeout=2)
        if self.serial and self.serial.is_open:
            self.serial.close()
        self.connected = False
        self.esp32_status['serial_connected'] = False
        logger.info("Serial disconnected")

    def _read_loop(self):
        """Background thread: read serial lines and route by prefix."""
        while self.running:
            try:
                if self.serial and self.serial.in_waiting:
                    line = self.serial.readline().decode('utf-8', errors='replace').strip()
                    if not line:
                        continue
                    self._route_line(line)
                else:
                    time.sleep(0.001)  # Prevent busy-waiting
            except serial.SerialException as e:
                logger.error(f"Serial device error: {e}")
                self.connected = False
                self.esp32_status['serial_connected'] = False
                break
            except Exception as e:
                logger.error(f"Serial read error: {e}")
                time.sleep(0.1)

    def _route_line(self, line: str):
        """Route incoming serial line by prefix."""
        if line.startswith('CSI,'):
            if self.on_csi:
                self.on_csi(line)
        elif line.startswith('AP,'):
            # Buffer AP lines for scan command
            self._pending_lines.append(line)
            if self.on_ap:
                self.on_ap(line)
        elif line.startswith('RSP:'):
            self._handle_response(line)
        elif line.startswith('HB,'):
            self._handle_heartbeat(line)
            if self.on_heartbeat:
                self.on_heartbeat(line)
        elif line.startswith('INFO,'):
            logger.info(f"ESP32: {line[5:]}")
            if self.on_info:
                self.on_info(line)

    def _handle_response(self, line: str):
        """Handle RSP: responses -- resolve pending command."""
        with self._lock:
            self._response_data = line
            self._response_event.set()

    def _handle_heartbeat(self, line: str):
        """Parse HB,timestamp,free_heap,wifi_status."""
        parts = line.split(',')
        if len(parts) >= 4:
            self.esp32_status['free_heap'] = int(parts[2]) if parts[2].isdigit() else 0
            self.esp32_status['wifi_connected'] = parts[3] == 'connected'

    def send_command(self, cmd: str, timeout: float = 10.0) -> Optional[str]:
        """Send command and wait for RSP: response. Thread-safe."""
        with self._lock:
            self._response_event.clear()
            self._response_data = None
            self._pending_lines.clear()

        # Send command
        if self.serial and self.serial.is_open:
            self.serial.write(f"CMD:{cmd}\n".encode())
            self.serial.flush()
            logger.debug(f"Sent: CMD:{cmd}")
        else:
            logger.warning("Cannot send command: serial not open")
            return None

        # Wait for response
        if self._response_event.wait(timeout=timeout):
            logger.debug(f"Received: {self._response_data}")
            return self._response_data
        logger.warning(f"Command timeout after {timeout}s: CMD:{cmd}")
        return None  # Timeout

    def send_command_multiline(self, cmd: str, end_prefix: str, timeout: float = 15.0) -> tuple:
        """Send command that returns multiple lines before a final RSP.
        Returns (response_line, buffered_lines).
        Used for WIFI_SCAN which returns AP lines then RSP:SCAN_END.
        """
        with self._lock:
            self._response_event.clear()
            self._response_data = None
            self._pending_lines.clear()

        if self.serial and self.serial.is_open:
            self.serial.write(f"CMD:{cmd}\n".encode())
            self.serial.flush()
            logger.debug(f"Sent multiline: CMD:{cmd}")
        else:
            return None, []

        # Wait for responses -- we may get SCAN_START first, then AP lines, then SCAN_END
        start_time = time.time()
        while time.time() - start_time < timeout:
            if self._response_event.wait(timeout=0.5):
                if self._response_data and end_prefix in self._response_data:
                    lines = list(self._pending_lines)
                    logger.debug(f"Multiline complete: {len(lines)} buffered lines")
                    return self._response_data, lines
                # Got a response but not the end -- reset and keep waiting
                with self._lock:
                    self._response_event.clear()
                    self._response_data = None

        return None, list(self._pending_lines)

    def wifi_scan(self) -> list:
        """Scan WiFi networks via ESP32. Returns list of dicts sorted by RSSI."""
        response, ap_lines = self.send_command_multiline("WIFI_SCAN", "SCAN_END", timeout=15.0)

        networks = []
        for line in ap_lines:
            parts = line.split(',')
            if len(parts) >= 6 and parts[0] == 'AP':
                networks.append({
                    'ssid': parts[2],
                    'mac': parts[3],
                    'rssi': int(parts[4]),
                    'channel': int(parts[5]),
                })

        # Sort by signal strength (strongest first)
        networks.sort(key=lambda x: x['rssi'], reverse=True)
        logger.info(f"WiFi scan found {len(networks)} networks")
        return networks

    def wifi_connect(self, ssid: str, password: str) -> dict:
        """Connect ESP32 to WiFi. Returns result dict."""
        ssid_b64 = base64.b64encode(ssid.encode()).decode()
        pass_b64 = base64.b64encode(password.encode()).decode()

        logger.info(f"Connecting to WiFi: {ssid}")
        response = self.send_command(f"WIFI_SET,{ssid_b64},{pass_b64}", timeout=20.0)

        if response and 'WIFI_OK' in response:
            # RSP:WIFI_OK,ip,channel,bssid
            parts = response.split(',')
            result = {
                'success': True,
                'ip': parts[1] if len(parts) > 1 else None,
                'channel': int(parts[2]) if len(parts) > 2 else None,
                'bssid': parts[3] if len(parts) > 3 else None,
            }
            self.esp32_status.update({
                'wifi_connected': True,
                'ssid': ssid,
                'ip': result['ip'],
                'channel': result['channel'],
                'csi_active': True,
            })
            logger.info(f"WiFi connected: {ssid} @ {result['ip']}")
            return result
        else:
            error = response.split(',', 1)[1] if response and ',' in response else 'Connection timeout'
            logger.warning(f"WiFi connect failed: {error}")
            return {'success': False, 'error': error}

    def wifi_status(self) -> dict:
        """Get WiFi status from ESP32."""
        response = self.send_command("WIFI_STATUS", timeout=5.0)

        if response and 'STATUS,' in response:
            # RSP:STATUS,connected,ssid,ip,rssi,channel
            parts = response.replace('RSP:STATUS,', '').split(',')
            connected = parts[0] == 'connected' if len(parts) > 0 else False
            return {
                'connected': connected,
                'ssid': parts[1] if len(parts) > 1 and parts[1] else None,
                'ip': parts[2] if len(parts) > 2 and parts[2] else None,
                'rssi': int(parts[3]) if len(parts) > 3 and parts[3] else None,
                'channel': int(parts[4]) if len(parts) > 4 and parts[4] else None,
            }
        return {'connected': False}

    def wifi_reset(self) -> bool:
        """Reset WiFi credentials on ESP32."""
        logger.info("Resetting WiFi credentials")
        response = self.send_command("WIFI_RESET", timeout=5.0)
        if response and 'RESET_OK' in response:
            self.esp32_status.update({
                'wifi_connected': False,
                'ssid': None,
                'ip': None,
                'csi_active': False,
            })
            logger.info("WiFi credentials reset successfully")
            return True
        logger.warning("WiFi reset failed")
        return False
