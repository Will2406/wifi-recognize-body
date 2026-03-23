"""
WiFi Sense Lab — Signal Processor Module

DSP pipeline for CSI data:
- Ring buffers for amplitude and phase history
- Phase unwrapping and sanitisation (linear slope & offset removal)
- Hampel outlier removal (MAD-based)
- NBVI-based subcarrier selection (locked at calibration time)
- Spatial turbulence metric (cross-subcarrier std)
- Moving variance of turbulence for presence detection
- P95 adaptive threshold from calibration baseline
- Doppler spectrum via STFT on phase differences
- Variance ratio retained for backward compatibility
- Butterworth bandpass retained as utility (not used in detection path)
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
                 movement_thresholds: dict | None = None,
                 num_selected_subcarriers: int = 12,
                 mvs_window_seconds: float = 2.0):
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
        num_selected_subcarriers : int
            Number of subcarriers to select via NBVI during calibration.
        mvs_window_seconds : float
            Window length in seconds for moving variance computation.
        """
        self.num_subcarriers = num_subcarriers
        self.sample_rate = sample_rate
        self.buffer_size = int(sample_rate * buffer_seconds)
        self.num_selected_subcarriers = num_selected_subcarriers
        self.mvs_window_seconds = mvs_window_seconds

        # Movement classification thresholds
        if movement_thresholds is None:
            movement_thresholds = {'quiet': 5, 'light': 30}
        self.movement_quiet_threshold = float(movement_thresholds.get('quiet', 5))
        self.movement_light_threshold = float(movement_thresholds.get('light', 30))

        # Ring buffers: each entry is a 1-D array of length num_subcarriers
        self.amplitude_buffer: deque = deque(maxlen=self.buffer_size)
        self.phase_buffer: deque = deque(maxlen=self.buffer_size)
        self.timestamp_buffer: deque = deque(maxlen=self.buffer_size)

        # Spatial turbulence buffer (Task 3.2)
        self.turbulence_buffer: deque = deque(maxlen=self.buffer_size)

        # Baseline (set during calibration)
        self.baseline_variance: np.ndarray | None = None  # per-subcarrier
        self.baseline_p95_mv: float | None = None  # P95 moving variance threshold

        # Selected subcarrier indices (locked after calibration via NBVI)
        self._selected_subcarriers: list[int] | None = None
        self._subcarriers_locked: bool = False

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

        # Compute and store spatial turbulence (Task 3.2)
        turbulence = self.compute_spatial_turbulence(amp_arr)
        self.turbulence_buffer.append(turbulence)

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

    def butterworth_bandpass(self, data: np.ndarray, lowcut: float = 0.1,
                             highcut: float = None,
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
        if highcut is None:
            highcut = nyq * 0.8  # 80% of Nyquist
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

        Uses a recent sliding window of raw amplitudes (Hampel-filtered only)
        compared against the baseline variance. No Butterworth at low sample
        rates — it removes the signal we need.

        R = mean(sigma2_live / sigma2_baseline) over selected subcarriers.

        Returns 0.0 if not calibrated or insufficient data.
        """
        # Use last ~10 seconds of data for responsive detection
        window = min(len(self.amplitude_buffer), int(self.sample_rate * 10))
        if window < 5:
            return 0.0

        # Stack recent buffer to matrix [samples x subcarriers]
        recent = list(self.amplitude_buffer)[-window:]
        amp_matrix = np.array(recent)

        # Apply Hampel filter per subcarrier (outlier removal only)
        for i in range(amp_matrix.shape[1]):
            amp_matrix[:, i] = self.hampel_filter(amp_matrix[:, i], window_size=3)

        # Compute variance over the recent window
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

    def compute_spatial_turbulence(self, amplitudes: np.ndarray) -> float:
        """Spatial turbulence = CV (coefficient of variation) across selected subcarriers.

        CV = std(amplitudes) / mean(amplitudes) — gain-invariant metric.
        Eliminates false detections from AGC/FFT gain fluctuations without
        needing firmware-level gain lock.

        Parameters
        ----------
        amplitudes : np.ndarray
            1-D array of amplitude values for a single CSI sample.

        Returns
        -------
        float
            Coefficient of variation across selected subcarriers.
        """
        selected = self.select_subcarriers()
        if len(selected) == 0:
            return 0.0
        sel_amps = amplitudes[selected]
        mean_amp = np.mean(sel_amps)
        if mean_amp < 1e-6:
            return 0.0
        return float(np.std(sel_amps) / mean_amp)

    def compute_moving_variance(self, window_packets: int = 75) -> float:
        """Moving variance of spatial turbulence over a packet-count window.

        Packet-count-based (not time-based) so it adapts to actual packet rate.
        Default 75 packets matches ESPectre's recommended window.

        Parameters
        ----------
        window_packets : int
            Number of recent packets to use. Defaults to 75.

        Returns
        -------
        float
            Variance of spatial turbulence over the window.
        """
        window = min(window_packets, len(self.turbulence_buffer))
        if window < 5:
            return 0.0
        recent = list(self.turbulence_buffer)[-window:]
        return float(np.var(recent))

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
        """Compute movement level from variance ratio relative to baseline.

        Uses the variance ratio directly as a movement indicator:
        - ratio ~1.0 = no movement (same as baseline)
        - ratio > 1.0 = movement detected
        - Scaled to 0-100 range where 100 = very strong movement

        Returns 0.0 if not calibrated or insufficient data.
        """
        if not self.calibrated:
            return 0.0

        ratio = self.compute_variance_ratio()
        if ratio <= 0:
            return 0.0

        # Scale: ratio of 1.0 = 0%, ratio of 5.0+ = 100%
        # Subtract 1.0 (baseline), then scale by 25 to get percentage
        movement = max(0.0, (ratio - 1.0)) * 25.0
        return float(np.clip(movement, 0.0, 100.0))

    def select_subcarriers(self) -> list[int]:
        """Return NBVI-selected subcarriers (locked after calibration).

        After calibration, returns the subcarriers with the lowest NBVI
        scores (most stable). Before calibration, falls back to the first
        ``num_selected_subcarriers`` subcarriers.

        Returns
        -------
        list[int]
            Indices of the selected subcarriers.
        """
        if self._subcarriers_locked and self._selected_subcarriers is not None:
            return self._selected_subcarriers

        # Fallback: first N subcarriers if not yet calibrated
        n = min(self.num_selected_subcarriers, self.num_subcarriers)
        return list(range(n))

    def _compute_nbvi(self, data: np.ndarray) -> np.ndarray:
        """Compute Narrowband Variance Index per subcarrier.

        NBVI = 0.3*(sigma/mu^2) + 0.7*(sigma/mu). Lower = more stable.

        Parameters
        ----------
        data : np.ndarray
            2-D array of shape (samples, subcarriers).

        Returns
        -------
        np.ndarray
            1-D array of NBVI scores per subcarrier.
        """
        mu = np.mean(data, axis=0)
        sigma = np.std(data, axis=0)
        safe_mu = np.where(np.abs(mu) > 1e-6, mu, 1e-6)
        nbvi = 0.3 * (sigma / (safe_mu ** 2)) + 0.7 * (sigma / np.abs(safe_mu))
        return nbvi

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
        self.baseline_p95_mv = None
        self._selected_subcarriers = None
        self._subcarriers_locked = False
        self._calibration_start = time.time()
        self._calibration_seconds = seconds
        self._calibration_amplitudes = []

    def _finish_calibration(self):
        """Compute baseline from collected calibration data.

        Steps:
        1. Hampel-filter calibration amplitudes (outlier removal).
        2. Compute per-subcarrier baseline variance.
        3. Compute NBVI and lock the best subcarriers (Task 3.1).
        4. Compute spatial turbulence per calibration sample (Task 3.4).
        5. Compute moving variances and store P95 threshold (Task 3.4).
        """
        if len(self._calibration_amplitudes) < 10:
            logger.warning("Calibration failed: not enough samples collected")
            self.calibrating = False
            return

        data = np.array(self._calibration_amplitudes)  # (T, N)

        # Apply same Hampel filter used in live detection
        for i in range(data.shape[1]):
            data[:, i] = self.hampel_filter(data[:, i], window_size=3)

        # Step 1: Baseline variance (backward compat)
        self.baseline_variance = np.var(data, axis=0)

        # Step 2: NBVI subcarrier selection — pick lowest scores (most stable)
        # Exclude guard bands (< 6, > 58), DC subcarrier (32), and null subcarriers
        nbvi_scores = self._compute_nbvi(data)
        mean_amps = np.mean(data, axis=0)
        amp_threshold = np.percentile(mean_amps[mean_amps > 0], 25) if np.any(mean_amps > 0) else 0

        # Build candidate list excluding guard/DC/weak subcarriers
        candidates = []
        for i in range(data.shape[1]):
            if i < 6 or i > 58:  # guard bands
                continue
            if i == 32:  # DC subcarrier
                continue
            if mean_amps[i] < amp_threshold:  # noise gate: below 25th percentile
                continue
            candidates.append(i)

        # Sort candidates by NBVI score (lowest = most stable)
        candidates.sort(key=lambda i: nbvi_scores[i])

        # Select top N with minimum spacing of 2 for spectral diversity
        selected = []
        for idx in candidates:
            if len(selected) >= self.num_selected_subcarriers:
                break
            # Enforce minimum spacing
            if any(abs(idx - s) < 2 for s in selected):
                continue
            selected.append(idx)

        selected.sort()
        self._selected_subcarriers = selected if selected else list(range(6, min(18, data.shape[1])))
        self._subcarriers_locked = True

        # Step 3: Compute spatial turbulence for each calibration sample
        cal_turbulence = []
        for row in data:
            cal_turbulence.append(self.compute_spatial_turbulence(row))

        # Step 4: Compute moving variances across the calibration turbulence
        #         series and store P95 threshold (packet-count window = 75)
        cal_turbulence_arr = np.array(cal_turbulence)
        mv_window = 75  # ESPectre default: 75 packets
        mv_window = min(mv_window, max(len(cal_turbulence_arr) // 3, 5))

        moving_variances = []
        for i in range(mv_window, len(cal_turbulence_arr) + 1):
            segment = cal_turbulence_arr[i - mv_window:i]
            moving_variances.append(float(np.var(segment)))

        if len(moving_variances) > 0:
            self.baseline_p95_mv = float(np.percentile(moving_variances, 95))
        else:
            self.baseline_p95_mv = 0.0

        self.calibrating = False
        self.calibrated = True
        self._calibration_amplitudes = []

        # Log useful diagnostics
        logger.info(f"Calibration complete: {data.shape[0]} samples, "
                    f"P95_mv = {self.baseline_p95_mv:.4f}, "
                    f"selected {len(self._selected_subcarriers)} subcarriers")

    # ------------------------------------------------------------------
    # Detection result helper
    # ------------------------------------------------------------------

    def get_detection_result(self) -> dict:
        """Return current detection state based on signal analysis.

        The primary presence metric is now moving variance of spatial
        turbulence compared against the P95 calibration threshold.
        Variance ratio is retained for backward compatibility and debugging.

        Returns
        -------
        dict
            Keys: presence, movement, movement_label, variance_ratio,
            spatial_turbulence, moving_variance, baseline_p95_mv,
            selected_subcarriers, calibrated, calibrating.
        """
        variance_ratio = self.compute_variance_ratio()
        movement = self.compute_movement_level()
        moving_variance = self.compute_moving_variance()

        # Latest spatial turbulence (from the turbulence buffer)
        spatial_turbulence = (
            self.turbulence_buffer[-1] if len(self.turbulence_buffer) > 0
            else 0.0
        )

        # Classify movement using configurable thresholds
        if movement < self.movement_quiet_threshold:
            movement_label = 'quiet'
        elif movement < self.movement_light_threshold:
            movement_label = 'light'
        else:
            movement_label = 'strong'

        # Presence decision: use moving variance vs P95 threshold (primary)
        if self.calibrated and self.baseline_p95_mv is not None:
            presence = moving_variance > self.baseline_p95_mv
        else:
            presence = False

        return {
            'presence': presence,
            'movement': round(movement, 1),
            'movement_label': movement_label,
            'variance_ratio': round(variance_ratio, 3),
            'spatial_turbulence': round(spatial_turbulence, 4),
            'moving_variance': round(moving_variance, 6),
            'baseline_p95_mv': round(self.baseline_p95_mv, 6) if self.baseline_p95_mv is not None else None,
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
