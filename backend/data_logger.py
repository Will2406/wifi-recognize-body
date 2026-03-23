"""
WiFi Sense Lab — Data Logger Module

Records CSI amplitude and phase data to CSV files for offline analysis
and ML training. Supports labeled recording sessions with start/stop control.

CSV format:
  timestamp, mac, rssi, channel, num_subcarriers, label, data_type, values
  data_type is 'amplitude' or 'phase'
  values is a comma-separated string of floats
"""

import csv
import os
import time
from datetime import datetime
import logging

logger = logging.getLogger(__name__)


class DataLogger:
    def __init__(self, data_dir=None):
        if data_dir is None:
            data_dir = os.path.join(os.path.dirname(__file__), '..', 'data')
        self.data_dir = data_dir
        os.makedirs(self.data_dir, exist_ok=True)

        self.recording = False
        self.file = None
        self.writer = None
        self.sample_count = 0
        self.start_time = None
        self.label = None
        self.filepath = None

    def start(self, label=None):
        """Start a new recording session.

        Parameters
        ----------
        label : str, optional
            Label for this recording (e.g. 'empty', 'walking', 'sitting').

        Returns
        -------
        dict
            Status with file path.
        """
        if self.recording:
            self.stop()

        self.label = label or 'unlabeled'
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        filename = f'csi_{self.label}_{timestamp}.csv'
        self.filepath = os.path.join(self.data_dir, filename)

        self.file = open(self.filepath, 'w', newline='')
        self.writer = csv.writer(self.file)
        # Header
        self.writer.writerow([
            'timestamp', 'mac', 'rssi', 'channel',
            'num_subcarriers', 'label', 'data_type', 'values'
        ])

        self.recording = True
        self.sample_count = 0
        self.start_time = time.time()

        logger.info(f"Recording started: {self.filepath} (label={self.label})")
        return {'status': 'recording', 'file': self.filepath, 'label': self.label}

    def stop(self):
        """Stop the current recording session.

        Returns
        -------
        dict
            Summary with sample count and duration.
        """
        if not self.recording:
            return {'status': 'not_recording'}

        self.recording = False
        duration = time.time() - self.start_time
        result = {
            'status': 'stopped',
            'file': self.filepath,
            'samples': self.sample_count,
            'duration': round(duration, 1),
            'label': self.label,
        }

        if self.file:
            self.file.close()
            self.file = None
            self.writer = None

        logger.info(f"Recording stopped: {self.sample_count} samples, "
                    f"{duration:.1f}s, file={self.filepath}")
        return result

    def log(self, timestamp, mac, rssi, channel, num_sub, amplitudes, phases):
        """Log a single CSI sample (amplitude + phase rows).

        Parameters
        ----------
        timestamp : int
            ESP32 timestamp in milliseconds.
        mac : str
            Source MAC address.
        rssi : int
            RSSI value.
        channel : int
            WiFi channel.
        num_sub : int
            Number of subcarriers.
        amplitudes : list[float]
            Amplitude values per subcarrier.
        phases : list[float]
            Phase values per subcarrier.
        """
        if not self.recording or not self.writer:
            return

        # Write amplitude row
        amp_str = ','.join(f'{a:.2f}' for a in amplitudes)
        self.writer.writerow([
            timestamp, mac, rssi, channel, num_sub,
            self.label, 'amplitude', amp_str
        ])

        # Write phase row
        phase_str = ','.join(f'{p:.4f}' for p in phases)
        self.writer.writerow([
            timestamp, mac, rssi, channel, num_sub,
            self.label, 'phase', phase_str
        ])

        self.sample_count += 1

        # Flush every 100 samples to avoid data loss
        if self.sample_count % 100 == 0 and self.file:
            self.file.flush()

    def get_status(self):
        """Get current recording status.

        Returns
        -------
        dict
            Recording state, file path, sample count, and duration.
        """
        if self.recording:
            return {
                'recording': True,
                'file': self.filepath,
                'samples': self.sample_count,
                'duration': round(time.time() - self.start_time, 1),
                'label': self.label,
            }
        return {'recording': False}
