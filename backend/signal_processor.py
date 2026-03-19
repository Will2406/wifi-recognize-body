"""
WiFi Sense Lab — Signal Processor Module

DSP pipeline for CSI data:
- Hampel outlier removal
- Butterworth bandpass filter (0.5-25 Hz)
- STFT (Short-Time Fourier Transform)
- Variance ratio calculation

Phase 2 implementation.
"""
