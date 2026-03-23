"""
WiFi Sense Lab — Presence/Movement Detector Module

High-level detection wrapper around SignalProcessor:
- Presence detection via variance ratio threshold
- Movement detection via Doppler energy analysis
- Movement classification (quiet, light, strong)
- Calibration mode for baseline capture
"""

import logging
import time
import numpy as np

from signal_processor import SignalProcessor

logger = logging.getLogger(__name__)


class PresenceDetector:
    def __init__(self, threshold: float = 3.0, calibration_seconds: float = 30.0,
                 num_subcarriers: int = 64, sample_rate: float = 50.0,
                 buffer_seconds: int = 10,
                 movement_thresholds: dict | None = None,
                 num_selected_subcarriers: int = 12,
                 mvs_window_seconds: float = 2.0,
                 threshold_multiplier: float = 1.4):
        """
        Parameters
        ----------
        threshold : float
            Variance ratio above which presence is detected (legacy fallback).
        calibration_seconds : float
            Duration of baseline calibration in seconds.
        num_subcarriers : int
            Expected number of subcarriers from ESP32.
        sample_rate : float
            Approximate CSI packet rate in Hz.
        buffer_seconds : int
            Ring buffer duration in seconds.
        movement_thresholds : dict, optional
            Keys 'quiet' and 'light' for movement classification boundaries.
        num_selected_subcarriers : int
            Number of subcarriers to select via NBVI during calibration.
        mvs_window_seconds : float
            Window length in seconds for moving variance computation.
        threshold_multiplier : float
            Multiplier applied to baseline_p95_mv for adaptive threshold.
        """
        self.threshold = threshold
        self.calibration_seconds = calibration_seconds
        self.threshold_multiplier = threshold_multiplier

        # Core signal processor
        self.processor = SignalProcessor(
            num_subcarriers=num_subcarriers,
            sample_rate=sample_rate,
            buffer_seconds=buffer_seconds,
            movement_thresholds=movement_thresholds,
            num_selected_subcarriers=num_selected_subcarriers,
            mvs_window_seconds=mvs_window_seconds,
        )

        # Detection state
        self._last_result: dict = {
            'presence': False,
            'movement': 0.0,
            'movement_label': 'quiet',
            'variance_ratio': 0.0,
            'spatial_turbulence': 0.0,
            'moving_variance': 0.0,
            'adaptive_threshold': None,
            'baseline_p95_mv': None,
            'selected_subcarriers': [],
            'calibrated': False,
            'calibrating': False,
        }

        # Smoothing: keep last N detection results for temporal smoothing
        # At low packet rates, use larger history for stability
        self._history_size = 10
        self._presence_history: list[bool] = []

        # Hold-on timer: once presence is detected, keep it active
        # for at least this many seconds (avoids flickering)
        self._presence_hold_seconds = 5.0
        self._last_presence_time: float = 0.0

        # Stats
        self._sample_count = 0
        self._last_detection_time: float = 0.0

    # ------------------------------------------------------------------
    # Calibration
    # ------------------------------------------------------------------

    def start_calibration(self):
        """Start calibration mode — collect baseline data for empty room.

        The room should be empty during calibration. Data collection runs
        for ``self.calibration_seconds`` seconds, then baseline variance
        is automatically computed.
        """
        logger.info(f"Detector: starting calibration ({self.calibration_seconds}s)")
        self.processor.calibrate(seconds=self.calibration_seconds)

    @property
    def calibrating(self) -> bool:
        return self.processor.calibrating

    @property
    def calibrated(self) -> bool:
        return self.processor.calibrated

    # ------------------------------------------------------------------
    # Main update
    # ------------------------------------------------------------------

    def update(self, amplitudes: list[float] | np.ndarray,
               phases: list[float] | np.ndarray,
               timestamp: int) -> dict:
        """Process a new CSI sample and return the detection result.

        Parameters
        ----------
        amplitudes : array-like
            Amplitude values per subcarrier.
        phases : array-like
            Phase values per subcarrier (radians).
        timestamp : int
            Millisecond timestamp from ESP32.

        Returns
        -------
        dict
            Detection result with keys: presence, movement, movement_label,
            variance_ratio, selected_subcarriers, calibrated, calibrating.
        """
        self._sample_count += 1

        # Feed into signal processor
        self.processor.add_sample(amplitudes, phases, timestamp)

        # Run detection every ~200ms (not every packet) to save CPU
        now = time.time()
        if now - self._last_detection_time < 0.2 and self._sample_count > 1:
            return self._last_result

        self._last_detection_time = now

        # Get raw detection from processor
        result = self.processor.get_detection_result()

        # Presence via adaptive threshold on moving variance
        if self.processor.calibrated and result.get('baseline_p95_mv') is not None:
            baseline_p95_mv = result['baseline_p95_mv']
            adaptive_threshold = baseline_p95_mv * self.threshold_multiplier
            moving_variance = result.get('moving_variance', 0.0)
            raw_presence = moving_variance > adaptive_threshold
            result['adaptive_threshold'] = round(adaptive_threshold, 6)
        else:
            raw_presence = False
            result['adaptive_threshold'] = None

        # Temporal smoothing on presence
        self._presence_history.append(raw_presence)
        if len(self._presence_history) > self._history_size:
            self._presence_history.pop(0)

        # Presence if ANY recent detection was positive (sensitive)
        # Plus hold-on timer to prevent flickering
        if raw_presence:
            self._last_presence_time = now

        any_recent = any(self._presence_history[-3:]) if len(self._presence_history) >= 3 else raw_presence
        held = (now - self._last_presence_time) < self._presence_hold_seconds
        smoothed_presence = any_recent or held

        result['presence'] = smoothed_presence
        self._last_result = result
        return result

    # ------------------------------------------------------------------
    # State query
    # ------------------------------------------------------------------

    def get_state(self) -> dict:
        """Return current detector state.

        Returns
        -------
        dict
            Current detection result plus calibration status and sample count.
        """
        return {
            **self._last_result,
            'sample_count': self._sample_count,
            'threshold': self.threshold,
            'threshold_multiplier': self.threshold_multiplier,
        }
