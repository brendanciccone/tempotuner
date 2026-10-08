import { fftInPlace, nextPowerOfTwo } from "@/utils/fft"

// Constants for audio processing
export const SIGNAL_THRESHOLD = 0.02 // Minimum RMS level to consider as signal (raised to reduce false triggers from background noise)
export const MIN_FREQUENCY = 27.5 // A0 - lowest piano note
export const MAX_FREQUENCY = 4186.0 // C8 - highest piano note
export const FREQUENCY_BUFFER_SIZE = 9 // Median filter buffer (odd number for true median, larger = more stable)

// AnalyserNode accepts frames of 32 to 32768 samples. 8192 is the floor this
// tuner has always used: at common rates it holds two periods of A0 and gives
// the YIN sum enough samples at low lags.
const MIN_ANALYSIS_FRAME = 8192
const MAX_ANALYSIS_FRAME = 32768

// Pre-allocated work buffers, reused every frame. The tuner analyses ~28 frames
// a second, so allocating these per call would be steady GC pressure.
let yinWorkBuffer: Float32Array | null = null
let differenceWorkBuffer: Float32Array | null = null
let fftReal: Float64Array | null = null
let fftImag: Float64Array | null = null
let energyPrefix: Float64Array | null = null

// Calculate RMS (Root Mean Square) of the buffer to determine signal strength
export const getRMS = (buffer: Float32Array<ArrayBuffer>): number => {
  let sum = 0
  for (let i = 0; i < buffer.length; i++) {
    sum += buffer[i] * buffer[i]
  }
  return Math.sqrt(sum / buffer.length)
}

/**
 * Improved YIN pitch detection algorithm
 * Reference: "YIN, a fundamental frequency estimator for speech and music" by de Cheveigné & Kawahara
 * 
 * Key improvements over previous implementation:
 * - Proper threshold handling with fallback to absolute minimum
 * - Better parabolic interpolation
 * - Cleaner code structure
 */
export const detectPitchYIN = (buffer: Float32Array<ArrayBuffer>, sampleRate: number): number => {
  // Early exit for silence - use consistent threshold with signal detection in use-tuner.ts
  const rms = getRMS(buffer)
  if (rms < SIGNAL_THRESHOLD) {
    return 0
  }

  const bufferSize = buffer.length
  const halfSize = Math.floor(bufferSize / 2)

  // Only lags inside the instrument range are ever examined, so the
  // difference function is computed for those and no further.
  const tauMin = Math.max(2, Math.floor(sampleRate / MAX_FREQUENCY))
  const tauMax = Math.min(halfSize - 1, Math.floor(sampleRate / MIN_FREQUENCY))
  if (tauMax <= tauMin) {
    return 0
  }

  if (!yinWorkBuffer || !differenceWorkBuffer || yinWorkBuffer.length < tauMax + 1) {
    yinWorkBuffer = new Float32Array(tauMax + 1)
    differenceWorkBuffer = new Float32Array(tauMax + 1)
  }
  const yinBuffer = yinWorkBuffer
  // Kept apart from the normalized copy in yinBuffer: step 4 refines on it.
  const difference = differenceWorkBuffer

  // Step 1: Calculate the difference function
  // d(tau) = sum of squared differences between signal and its shifted version
  // Note: We operate directly on the raw buffer (no windowing). YIN's difference
  // function is inherently robust to non-stationarity, and windowing attenuates
  // buffer edges which reduces effective sample count for low-frequency lags.
  differenceFunction(buffer, tauMax, difference)

  // Step 2: Cumulative mean normalized difference function (CMNDF)
  // This normalizes the difference function to make threshold selection easier
  yinBuffer[0] = 1.0 // By definition
  let runningSum = 0

  for (let tau = 1; tau <= tauMax; tau++) {
    runningSum += difference[tau]
    if (runningSum === 0) {
      yinBuffer[tau] = 1.0
    } else {
      yinBuffer[tau] = difference[tau] * tau / runningSum
    }
  }

  // Step 3: Absolute threshold
  // Find the first tau where CMNDF dips below threshold
  const threshold = 0.15 // Slightly stricter threshold reduces false detections from noise

  let bestTau = -1
  let bestValue = 1.0

  // First pass: find first dip below threshold
  for (let tau = tauMin; tau < tauMax; tau++) {
    if (yinBuffer[tau] < threshold) {
      // Walk down to the local minimum
      while (tau + 1 < tauMax && yinBuffer[tau + 1] < yinBuffer[tau]) {
        tau++
      }
      bestTau = tau
      break
    }
  }

  // Fallback: if no value below threshold, use the global minimum
  if (bestTau < 0) {
    for (let tau = tauMin; tau < tauMax; tau++) {
      if (yinBuffer[tau] < bestValue) {
        bestValue = yinBuffer[tau]
        bestTau = tau
      }
    }
    // Only use fallback if the minimum is reasonably low (stricter than before)
    if (bestValue > 0.35) {
      return 0
    }
  }

  if (bestTau < 0) {
    return 0
  }

  // A minimum on the last lag searched is the edge of the window, not a
  // period: the true period is longer than this frame can hold, and reporting
  // the edge would show a confident wrong note (an E1 read as F#1).
  if (bestTau >= tauMax - 1) {
    return 0
  }

  // Step 4: Parabolic interpolation for sub-sample accuracy, on the raw
  // difference function rather than the normalized one. The normalization
  // skews the curve around the dip, and the parabola inherits that skew as a
  // pitch error that grows as the period gets shorter: measured on clean tones,
  // C7 at 44.1kHz read 2.0 cents sharp against 0.1 here, and E6 at a Bluetooth
  // headset's 16kHz read 6.1 cents sharp against 0.7.
  const refinedTau = parabolicInterpolation(difference, bestTau, tauMax)

  // Convert tau (period in samples) to frequency
  return sampleRate / refinedTau
}

/**
 * The analysis frame for a device sample rate, in samples.
 *
 * YIN only finds periods shorter than half the frame, so the frame has to hold
 * two periods of the lowest note the tuner reads. The AudioContext runs at the
 * device's own rate, and at 176.4/192kHz (pro interfaces, high-res DACs) the
 * fixed 8192-sample frame topped out at 46.9Hz — below that, a bass's low E
 * came back as the wrong note.
 */
export const analysisFrameSize = (sampleRate: number): number => {
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) {
    throw new RangeError(`sampleRate must be a positive finite number, got ${sampleRate}`)
  }

  const longestPeriod = Math.ceil(sampleRate / MIN_FREQUENCY)
  const needed = nextPowerOfTwo(2 * (longestPeriod + 2))
  return Math.min(MAX_ANALYSIS_FRAME, Math.max(MIN_ANALYSIS_FRAME, needed))
}

/**
 * YIN's difference function, d(tau) = Σ_{i=0}^{N-1-tau} (x[i] − x[i+tau])², for
 * every lag 0..maxTau, written into `out`.
 *
 * Summed directly this is O(N·maxTau). The loop it replaces ran every lag out
 * to N/2 — ~25M multiply-adds per 8192-sample frame, measured at ~50ms of
 * main-thread time on a desktop CPU against a 35ms frame budget, with phones
 * slower still. This form measures ~2ms for the same frame and gives
 * identical values once stored as Float32. Expanding the square
 * gives the same values from two energy terms and an autocorrelation,
 *
 *   d(tau) = Σ_{i<N−tau} x[i]² + Σ_{i≥tau} x[i]² − 2·r(tau)
 *
 * and r is the inverse FFT of the power spectrum (Wiener–Khinchin), so the whole
 * thing is O(N log N). The frame is zero-padded to at least N + maxTau so the
 * circular correlation the FFT computes never wraps into the lags we read.
 */
export const differenceFunction = (
  buffer: Readonly<Float32Array>,
  maxTau: number,
  out: Float32Array,
): void => {
  const n = buffer.length
  if (!Number.isInteger(maxTau) || maxTau < 0 || maxTau >= n) {
    throw new RangeError(`maxTau must be an integer in [0, ${n - 1}], got ${maxTau}`)
  }
  if (out.length < maxTau + 1) {
    throw new RangeError(`difference output needs ${maxTau + 1} slots, got ${out.length}`)
  }

  const size = nextPowerOfTwo(n + maxTau)
  if (!fftReal || fftReal.length !== size || !fftImag) {
    fftReal = new Float64Array(size)
    fftImag = new Float64Array(size)
  }
  if (!energyPrefix || energyPrefix.length !== n + 1) {
    energyPrefix = new Float64Array(n + 1)
  }
  const re = fftReal
  const im = fftImag
  const energy = energyPrefix

  // energy[k] = Σ_{i<k} x[i]², so any run of squared samples is one subtraction.
  energy[0] = 0
  for (let i = 0; i < n; i++) {
    energy[i + 1] = energy[i] + buffer[i] * buffer[i]
    re[i] = buffer[i]
    im[i] = 0
  }
  re.fill(0, n)
  im.fill(0, n)

  fftInPlace(re, im)
  for (let k = 0; k < size; k++) {
    re[k] = re[k] * re[k] + im[k] * im[k]
    im[k] = 0
  }
  // The power spectrum of a real signal is real and even, so its inverse DFT
  // equals its forward DFT divided by the size — no separate inverse needed.
  fftInPlace(re, im)

  out[0] = 0
  for (let tau = 1; tau <= maxTau; tau++) {
    const autocorrelation = re[tau] / size
    const d = energy[n - tau] + (energy[n] - energy[tau]) - 2 * autocorrelation
    // Rounding in the subtraction can leave a hair below zero at a perfect
    // match; a squared distance cannot be negative.
    out[tau] = d > 0 ? d : 0
  }
}

/**
 * Parabolic interpolation to refine the pitch estimate
 * Fits a parabola through three points and finds the minimum
 */
const parabolicInterpolation = (curve: Float32Array, tau: number, maxTau: number): number => {
  if (tau <= 0 || tau >= maxTau - 1) {
    return tau
  }

  const s0 = curve[tau - 1]
  const s1 = curve[tau]
  const s2 = curve[tau + 1]

  // Parabolic interpolation formula
  const denominator = 2 * (2 * s1 - s2 - s0)
  if (denominator === 0) {
    return tau
  }

  const adjustment = (s2 - s0) / denominator

  // Sanity check: adjustment should be small
  if (Math.abs(adjustment) > 1) {
    return tau
  }

  return tau + adjustment
}

/**
 * Simple median filter for frequency smoothing
 * More robust than weighted averages for removing outliers
 */
export const getMedianFrequency = (frequencies: number[]): number => {
  if (frequencies.length === 0) return 0
  if (frequencies.length === 1) return frequencies[0]

  const sorted = [...frequencies].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)

  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2
  }
  return sorted[mid]
}

/**
 * Check if a new frequency is consistent with recent readings
 * Helps filter out octave errors and spurious readings
 */
export const isFrequencyConsistent = (
  newFreq: number,
  recentFrequencies: number[],
  tolerancePercent: number = 8
): boolean => {
  if (recentFrequencies.length < 2) return true

  const median = getMedianFrequency(recentFrequencies)
  const tolerance = median * (tolerancePercent / 100)

  return Math.abs(newFreq - median) <= tolerance
}

/**
 * Calculate cents between a detected frequency and a target note frequency
 */
export const centsFromFrequencies = (detected: number, target: number): number => {
  return Math.round(1200 * Math.log2(detected / target))
}

/**
 * Detect potential octave errors
 * Returns the corrected frequency if an octave error is detected
 */
export const correctOctaveError = (
  newFreq: number,
  recentFrequencies: number[]
): number => {
  if (recentFrequencies.length < 3) return newFreq

  const median = getMedianFrequency(recentFrequencies)

  // Check if new frequency is approximately double (octave up error)
  if (Math.abs(newFreq / median - 2) < 0.1) {
    return newFreq / 2
  }

  // Check if new frequency is approximately half (octave down error)
  if (Math.abs(newFreq / median - 0.5) < 0.05) {
    return newFreq * 2
  }

  return newFreq
}
