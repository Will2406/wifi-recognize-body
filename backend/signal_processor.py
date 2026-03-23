"""
WiFi Sense Lab — Signal Processor Module

DSP pipeline for CSI data:
- Ring buffers for amplitude and phase history
- Phase unwrapping and sanitisation (linear slope & offset removal)
- Hampel outlier removal (MAD-based)
- Butterworth bandpass filter (0.5-25 Hz)
- Subcarrier selection by temporal variance
- Doppler spectrum via STFT on phase differences
- Variance ratio for presence detection
- Movement level from Doppler energy
"""

import numpy as np
from scipy.signal import butter, filtfilt
from collections import deque
import logging
import time

logger = logging.getLogger(__name__)


class SignalProcessor:
    def __init__(self, num_subcarriers: int = 64, sample_rate: float = 50.0,
                 buffer_seconds: int = 10,
                 movement_thresholds: dict | None = None):
        """
        Parameters
        ----------
        num_subcarriers : int
            Expected number of subcarriers (may vary 56-64 on ESP32).
        sample_rate : float
            Approximate CSI sample rate in Hz.
        buffer_seconds : int
            How many seconds of history to keep in the ring buffers.
        movement_thresholds : dict, optional
            Keys 'quiet' and 'light' with numeric thresholds for movement
            classification. Defaults to {'quiet': 5, 'light': 30}.
        """
        self.num_subcarriers = num_subcarriers
        self.sample_rate = sample_rate
        self.buffer_size = int(sample_rate * buffer_seconds)

        # Movement classification thresholds
        if movement_thresholds is None:
            movement_thresholds = {'quiet': 5, 'light': 30}
        self.movement_quiet_threshold = float(movement_thresholds.get('quiet', 5))
        self.movement_light_threshold = float(movement_thresholds.get('light', 30))

        # Ring buffers: each entry is a 1-D array of length num_subcarriers
        self.amplitude_buffer: deque = deque(maxlen=self.buffer_size)
        self.phase_buffer: deque = deque(maxlen=self.buffer_size)
        self.timestamp_buffer: deque = deque(maxlen=self.buffer_size)

        # Baseline (set during calibration)
        self.baseline_variance: np.ndarray | None = None  # per-subcarrier

        # Selected subcarrier indices
        self._selected_subcarriers: list[int] | None = None

        # Sample counter for periodic recomputation
        self._sample_count: int = 0

        # Calibration state
        self.calibrating = False
        self.calibrated = False
        self._calibration_start: float | None = None
        self._calibration_seconds: float = 30.0
        self._calibration_amplitudes: list[np.ndarray] = []

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def add_sample(self, amplitudes: list[float] | np.ndarray,
                   phases: list[float] | np.ndarray,
                   timestamp: int):
        """Add a new CSI sample to the ring buffers.

        Applies phase unwrapping and sanitisation before storing.
        If the number of subcarriers changes, silently pad/truncate to
        ``self.num_subcarriers`` so downstream code never breaks.
        """
        amp_arr = np.asarray(amplitudes, dtype=np.float64)
        phase_arr = np.asarray(phases, dtype=np.float64)

        # Normalise length
        amp_arr = self._normalise_length(amp_arr)
        phase_arr = self._normalise_length(phase_arr)

        # Apply phase unwrapping to remove 2-pi discontinuities
        phase_arr = np.unwrap(phase_arr)

        # Apply phase sanitisation (remove linear slope + offset)
        phase_arr = self.sanitize_phase(phase_arr)

        # Store in buffers
        self.amplitude_buffer.append(amp_arr)
        self.phase_buffer.append(phase_arr)
        self.timestamp_buffer.append(timestamp)
        self._sample_count += 1

        # Calibration collection
        if self.calibrating:
            self._calibration_amplitudes.append(amp_arr)
            elapsed = time.time() - self._calibration_start
            if elapsed >= self._calibration_seconds:
                self._finish_calibration()

    # ------------------------------------------------------------------
    # Filters
    # ------------------------------------------------------------------

    def hampel_filter(self, data: np.ndarray, window_size: int = 10,
                      threshold: float = 3.0) -> np.ndarray:
        """Hampel filter for outlier removal using Median Absolute Deviation.

        Parameters
        ----------
        data : np.ndarray
            1-D time series (one subcarrier over time).
        window_size : int
            Half-window size (samples each side).
        threshold : float
            Number of MADs above which a sample is considered an outlier.

        Returns
        -------
        np.ndarray
            Filtered copy of *data*.
        """
        n = len(data)
        if n < 2 * window_size + 1:
            return data.copy()

        filtered = data.copy()
        k = 1.4826  # scale factor for Gaussian consistency

        for i in range(window_size, n - window_size):
            window = data[i - window_size:i + window_size + 1]
            median = np.median(window)
            mad = k * np.median(np.abs(window - median))
            if mad < 1e-9:
                continue
            if np.abs(data[i] - median) / mad > threshold:
                filtered[i] = median

        return filtered

    def butterworth_bandpass(self, data: np.ndarray, lowcut: float = 0.5,
                             highcut: float = 25.0,
                             order: int = 4) -> np.ndarray:
        """Apply a Butterworth bandpass filter to a 1-D signal.

        Parameters
        ----------
        data : np.ndarray
            1-D time series.
        lowcut, highcut : float
            Band edges in Hz.
        order : int
            Filter order.

        Returns
        -------
        np.ndarray
            Filtered signal (same length).
        """
        nyq = 0.5 * self.sample_rate
        low = lowcut / nyq
        high = highcut / nyq

        # Clamp to valid Butterworth range
        low = max(low, 1e-5)
        high = min(high, 1.0 - 1e-5)
        if low >= high:
            return data.copy()

        # Need enough samples for filtfilt
        min_len = 3 * max(order, 1) + 1
        if len(data) < min_len:
            return data.copy()

        try:
            b, a = butter(order, [low, high], btype='band')
            return filtfilt(b, a, data)
        except Exception:
            return data.copy()

    def sanitize_phase(self, phases: np.ndarray) -> np.ndarray:
        """Remove linear phase slope and constant offset.

        phi_clean(k) = phi_raw(k) - slope*k - mean(phi)
        where slope = (phi(K) - phi(1)) / (K - 1)

        Parameters
        ----------
        phases : np.ndarray
            1-D array of phase values across subcarriers for a single snapshot.

        Returns
        -------
        np.ndarray
            Sanitised phases.
        """
        K = len(phases)
        if K < 2:
            return phases.copy()

        slope = (phases[-1] - phases[0]) / (K - 1)
        indices = np.arange(K, dtype=np.float64)
        mean_phase = np.mean(phases)
        return phases - slope * indices - mean_phase

    # ------------------------------------------------------------------
    # Analysis
    # ------------------------------------------------------------------

    def compute_variance_ratio(self) -> float:
        """Compute variance ratio for presence detection.

        Applies Hampel filter and Butterworth bandpass to amplitude data
        before computing variance. This removes outliers and band-limits
        the signal to the frequencies of interest (human movement).

        R = mean(sigma2_live / sigma2_baseline) over selected subcarriers.

        Returns 0.0 if not calibrated or insufficient data.
        """
        if len(self.amplitude_buffer) < 20:
            return 0.0

        # Stack buffer to matrix [samples x subcarriers]
        amp_matrix = np.array(list(self.amplitude_buffer))

        # Apply Hampel filter per subcarrier column
        for i in range(amp_matrix.shape[1]):
            amp_matrix[:, i] = self.hampel_filter(amp_matrix[:, i])

        # Apply Butterworth bandpass per subcarrier (need minimum samples)
        if amp_matrix.shape[0] >= 13:  # minimum for 4th order filter
            for i in range(amp_matrix.shape[1]):
                amp_matrix[:, i] = self.butterworth_bandpass(amp_matrix[:, i])

        # Compute variance
        live_var = np.var(amp_matrix, axis=0)

        if self.baseline_variance is not None and self.calibrated:
            safe_baseline = np.where(
                self.baseline_variance > 1e-10, self.baseline_variance, 1e-10
            )
            ratios = live_var / safe_baseline

            selected = self.select_subcarriers()
            if len(selected) == 0:
                return 0.0

            return float(np.mean(ratios[selected]))

        return float(np.mean(live_var))

    def compute_doppler(self, window_seconds: float = 2.0) -> np.ndarray:
        """Compute Doppler spectrum via STFT on phase differences.

        Applies Hampel filter to phase data before computing FFT to
        remove outlier spikes that would corrupt the spectrum.

        Uses the most recent ``window_seconds`` of data.

        Returns
        -------
        np.ndarray
            1-D power spectrum (positive frequencies) averaged over selected subcarriers.
            Empty array if insufficient data.
        """
        n_samples = int(self.sample_rate * window_seconds)
        if len(self.phase_buffer) < max(n_samples, 4):
            return np.array([])

        phases = np.array(list(self.phase_buffer)[-n_samples:])  # (T, N)

        if phases.shape[0] < 4:
            return np.array([])

        # Apply Hampel filter per subcarrier to clean phase data
        for i in range(phases.shape[1]):
            phases[:, i] = self.hampel_filter(phases[:, i], window_size=5)

        # Phase difference over time
        phase_diff = np.diff(phases, axis=0)  # (T-1, N)

        subs = self.select_subcarriers()
        if len(subs) == 0:
            subs = list(range(min(15, phases.shape[1])))

        phase_diff_sel = phase_diff[:, subs]  # (T-1, len(subs))

        # FFT per subcarrier, average power
        n_fft = phase_diff_sel.shape[0]
        if n_fft < 4:
            return np.array([])

        window = np.hanning(n_fft)
        spectra = []
        for j in range(phase_diff_sel.shape[1]):
            sig = phase_diff_sel[:, j] * window
            fft_vals = np.fft.rfft(sig)
            power = np.abs(fft_vals) ** 2
            spectra.append(power)

        avg_spectrum = np.mean(spectra, axis=0)
        return avg_spectrum

    def compute_movement_level(self) -> float:
        """Compute movement level from Doppler energy.

        M = energy_nonzero_doppler / total_energy * 100

        Returns 0.0 if no Doppler data.
        """
        spectrum = self.compute_doppler()
        if len(spectrum) < 3:
            return 0.0

        total_energy = np.sum(spectrum)
        if total_energy < 1e-12:
            return 0.0

        # Skip DC bin (index 0) -- non-zero Doppler is everything else
        nonzero_energy = np.sum(spectrum[1:])
        movement = (nonzero_energy / total_energy) * 100.0
        return float(np.clip(movement, 0.0, 100.0))

    def select_subcarriers(self, top_n: int = 15) -> list[int]:
        """Select most sensitive subcarriers by temporal variance.

        Caches the result and only recomputes every ~100 samples.

        Returns
        -------
        list[int]
            Indices of the top-N subcarriers.
        """
        # Recompute periodically
        buf_len = len(self.amplitude_buffer)
        if (self._selected_subcarriers is not None
                and buf_len % 100 != 0
                and buf_len > 0):
            return self._selected_subcarriers

        if buf_len < 20:
            self._selected_subcarriers = list(range(min(top_n, self.num_subcarriers)))
            return self._selected_subcarriers

        data = np.array(list(self.amplitude_buffer))  # (T, N)
        variance = np.var(data, axis=0)
        n = min(top_n, data.shape[1])
        indices = np.argsort(variance)[-n:].tolist()
        indices.sort()
        self._selected_subcarriers = indices
        return self._selected_subcarriers

    # ------------------------------------------------------------------
    # Calibration
    # ------------------------------------------------------------------

    def calibrate(self, seconds: float = 30.0):
        """Start calibration: capture baseline variance for empty room.

        During calibration, amplitude samples are collected. After ``seconds``
        have elapsed, the baseline variance is computed automatically.
        """
        logger.info(f"Starting calibration ({seconds}s) -- ensure the room is empty")
        self.calibrating = True
        self.calibrated = False
        self.baseline_variance = None
        self._calibration_start = time.time()
        self._calibration_seconds = seconds
        self._calibration_amplitudes = []

    def _finish_calibration(self):
        """Compute baseline variance from collected calibration data."""
        if len(self._calibration_amplitudes) < 10:
            logger.warning("Calibration failed: not enough samples collected")
            self.calibrating = False
            return

        data = np.array(self._calibration_amplitudes)  # (T, N)
        self.baseline_variance = np.var(data, axis=0)
        self.calibrating = False
        self.calibrated = True
        self._calibration_amplitudes = []
        logger.info(f"Calibration complete: {data.shape[0]} samples, "
                    f"mean baseline variance = {np.mean(self.baseline_variance):.2f}")

    # ------------------------------------------------------------------
    # Detection result helper
    # ------------------------------------------------------------------

    def get_detection_result(self) -> dict:
        """Return current detection state based on signal analysis.

        Returns
        -------
        dict
            Keys: presence, movement, movement_label, variance_ratio,
            selected_subcarriers, calibrated, calibrating.
        """
        variance_ratio = self.compute_variance_ratio()
        movement = self.compute_movement_level()

        # Classify movement using configurable thresholds
        if movement < self.movement_quiet_threshold:
            movement_label = 'quiet'
        elif movement < self.movement_light_threshold:
            movement_label = 'light'
        else:
            movement_label = 'strong'

        # Presence decision
        presence = variance_ratio > 3.0 if self.calibrated else False

        return {
            'presence': presence,
            'movement': round(movement, 1),
            'movement_label': movement_label,
            'variance_ratio': round(variance_ratio, 3),
            'selected_subcarriers': self.select_subcarriers(),
            'calibrated': self.calibrated,
            'calibrating': self.calibrating,
        }

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _normalise_length(self, arr: np.ndarray) -> np.ndarray:
        """Pad or truncate *arr* to ``self.num_subcarriers``."""
        if len(arr) == self.num_subcarriers:
            return arr
        if len(arr) > self.num_subcarriers:
            return arr[:self.num_subcarriers]
        # Pad with zeros
        padded = np.zeros(self.num_subcarriers, dtype=arr.dtype)
        padded[:len(arr)] = arr
        return padded
