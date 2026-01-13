// Constants for audio processing
export const SIGNAL_THRESHOLD = 0.01 // Minimum RMS level to consider as signal
export const MIN_FREQUENCY = 27.5 // A0 - lowest piano note
export const MAX_FREQUENCY = 4186.0 // C8 - highest piano note
export const FREQUENCY_BUFFER_SIZE = 5 // Small buffer for median filtering

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

  // Step 1: Calculate the difference function
  // d(tau) = sum of squared differences between signal and its shifted version
  const yinBuffer = new Float32Array(halfSize)

  // Calculate the squared difference for each lag (tau)
  for (let tau = 0; tau < halfSize; tau++) {
    let sum = 0
    // Iterate through all valid samples: i + tau must be < bufferSize
    // Using full buffer (not halfSize) improves accuracy for low frequencies
    const limit = bufferSize - tau
    for (let i = 0; i < limit; i++) {
      const delta = buffer[i] - buffer[i + tau]
      sum += delta * delta
    }
    yinBuffer[tau] = sum
  }

  // Step 2: Cumulative mean normalized difference function (CMNDF)
  // This normalizes the difference function to make threshold selection easier
  yinBuffer[0] = 1.0 // By definition
  let runningSum = 0

  for (let tau = 1; tau < halfSize; tau++) {
    runningSum += yinBuffer[tau]
    if (runningSum === 0) {
      yinBuffer[tau] = 1.0
    } else {
      yinBuffer[tau] = yinBuffer[tau] * tau / runningSum
    }
  }

  // Step 3: Absolute threshold
  // Find the first tau where CMNDF dips below threshold
  const threshold = 0.1 // Relaxed threshold for better detection

  // Calculate tau range based on frequency limits
  const tauMin = Math.max(2, Math.floor(sampleRate / MAX_FREQUENCY))
  const tauMax = Math.min(halfSize - 1, Math.floor(sampleRate / MIN_FREQUENCY))

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
    // Only use fallback if the minimum is reasonably low
    if (bestValue > 0.5) {
      return 0
    }
  }

  if (bestTau < 0) {
    return 0
  }

  // Step 4: Parabolic interpolation for sub-sample accuracy
  const refinedTau = parabolicInterpolation(yinBuffer, bestTau, tauMax)

  // Convert tau (period in samples) to frequency
  return sampleRate / refinedTau
}

/**
 * Parabolic interpolation to refine the pitch estimate
 * Fits a parabola through three points and finds the minimum
 */
const parabolicInterpolation = (yinBuffer: Float32Array<ArrayBuffer>, tau: number, maxTau: number): number => {
  if (tau <= 0 || tau >= maxTau - 1) {
    return tau
  }

  const s0 = yinBuffer[tau - 1]
  const s1 = yinBuffer[tau]
  const s2 = yinBuffer[tau + 1]

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
  tolerancePercent: number = 5
): boolean => {
  if (recentFrequencies.length < 2) return true

  const median = getMedianFrequency(recentFrequencies)
  const tolerance = median * (tolerancePercent / 100)

  return Math.abs(newFreq - median) <= tolerance
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
