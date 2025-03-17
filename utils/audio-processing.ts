// Constants for audio processing - optimized values
export const SIGNAL_THRESHOLD = 0.0025 // Reduced from 0.004 to 0.0025 for better sensitivity
export const MIN_FREQUENCY = 20.0 // Keep minimum frequency very low to support bass instruments
export const MAX_FREQUENCY = 8000.0 // Support for higher pitched instruments
export const FREQUENCY_BUFFER_SIZE = 16 // Reduced from 24 to 16 for less lag

// Frequency classification thresholds
export const VERY_LOW_FREQUENCY_THRESHOLD = 100 // Below this we use specialized detection
export const LOW_FREQUENCY_THRESHOLD = 200 // Below this we use less smoothing

// Calculate RMS (Root Mean Square) of the buffer to determine signal strength
export const getRMS = (buffer: Float32Array): number => {
  let sum = 0
  // Use a smaller sample for faster calculation
  const step = 4 // Skip every 4 samples for performance
  for (let i = 0; i < buffer.length; i += step) {
    sum += buffer[i] * buffer[i]
  }
  return Math.sqrt(sum / (buffer.length / step))
}

// Detect if the signal is likely a low frequency
export const detectLowFrequencySignal = (buffer: Float32Array, sampleRate: number): boolean => {
  // Count zero crossings with a step for performance
  let zeroCrossings = 0
  const step = 2 // Skip every other sample for performance
  for (let i = step; i < buffer.length; i += step) {
    if ((buffer[i] >= 0 && buffer[i - step] < 0) || (buffer[i] < 0 && buffer[i - step] >= 0)) {
      zeroCrossings++
    }
  }

  // Calculate approximate frequency from zero crossings
  const approxFreq = (zeroCrossings * sampleRate) / (2 * (buffer.length / step))

  // If the approximate frequency is low, use low frequency mode
  return approxFreq < VERY_LOW_FREQUENCY_THRESHOLD
}

// Specialized detection for very low frequencies (like bass guitar, contrabass, etc.)
export const detectVeryLowFrequency = (buffer: Float32Array, sampleRate: number): number => {
  // For very low frequencies, we need a longer analysis window

  // Find peaks in the waveform - use a step for performance
  const peaks: number[] = []
  const step = 4 // Skip samples for performance
  for (let i = step; i < buffer.length - step; i += step) {
    if (buffer[i] > buffer[i - step] && buffer[i] > buffer[i + step] && buffer[i] > 0.01) {
      peaks.push(i)
    }
  }

  if (peaks.length < 3) return 0

  // Calculate distances between peaks
  const peakDistances: number[] = []
  for (let i = 1; i < peaks.length; i++) {
    peakDistances.push(peaks[i] - peaks[i - 1])
  }

  // Filter out outliers (distances that are too short or too long)
  const sortedDistances = [...peakDistances].sort((a, b) => a - b)
  const medianDistance = sortedDistances[Math.floor(sortedDistances.length / 2)]

  // Filter distances that are within a reasonable range of the median
  const validDistances = peakDistances.filter((dist) => dist > medianDistance * 0.7 && dist < medianDistance * 1.3)

  if (validDistances.length >= 2) {
    // Calculate average period from valid distances
    const avgPeriod = validDistances.reduce((sum, val) => sum + val, 0) / validDistances.length
    return sampleRate / avgPeriod
  }

  return 0 // Could not detect a very low frequency
}

// Zero-crossing method for low frequency detection - optimized for low frequencies
export const detectPitchZeroCrossing = (buffer: Float32Array, sampleRate: number): number => {
  // First try specialized very low frequency detection
  const veryLowFreq = detectVeryLowFrequency(buffer, sampleRate)
  if (veryLowFreq > 0) {
    return veryLowFreq
  }

  // Find zero crossings - use a step for performance
  const crossings: number[] = []
  const step = 1 // No step for accuracy with low frequencies
  for (let i = step; i < buffer.length; i += step) {
    if ((buffer[i] >= 0 && buffer[i - step] < 0) || (buffer[i] < 0 && buffer[i - step] >= 0)) {
      // Interpolate for more accurate crossing point
      const t = i - buffer[i] / (buffer[i] - buffer[i - step])
      crossings.push(t)
    }
  }

  // Calculate periods between zero crossings
  const periods: number[] = []

  // For low frequencies, we need to look at longer periods
  // Use every 2nd crossing for more stable period calculation
  for (let i = 2; i < crossings.length; i += 2) {
    periods.push(crossings[i] - crossings[i - 2])
  }

  // If we don't have enough periods, return 0
  if (periods.length < 3) return 0

  // Sort periods and take the median to avoid outliers
  periods.sort((a, b) => a - b)
  const medianPeriod = periods[Math.floor(periods.length / 2)]

  // Convert period to frequency
  return sampleRate / medianPeriod
}

// Improved YIN algorithm for better pitch detection
export const detectPitchYIN = (buffer: Float32Array, sampleRate: number): number => {
  const threshold = 0.07 // Threshold for YIN algorithm
  const bufferSize = buffer.length
  const yinBuffer = new Float32Array(bufferSize / 2)

  // Step 1: Calculate difference function - use a step for performance
  const step = 2 // Skip samples for performance
  for (let t = 0; t < yinBuffer.length; t++) {
    yinBuffer[t] = 0
    for (let i = 0; i < yinBuffer.length; i += step) {
      const delta = buffer[i] - buffer[i + t]
      yinBuffer[t] += delta * delta
    }
    // Adjust for the step
    yinBuffer[t] *= step
  }

  // Step 2: Cumulative normalization
  let runningSum = 0
  yinBuffer[0] = 1
  for (let t = 1; t < yinBuffer.length; t++) {
    runningSum += yinBuffer[t]
    if (runningSum > 0) {
      yinBuffer[t] *= t / runningSum
    } else {
      yinBuffer[t] = 1
    }
  }

  // Step 3: Find the first minimum below the threshold
  let minValue = 1
  let minTau = -1

  // Skip the first few bins which often contain noise
  // Start from a lower index for better low frequency detection
  for (let t = 2; t < yinBuffer.length; t++) {
    if (yinBuffer[t] < threshold) {
      // Find the actual minimum in this valley
      let localMinValue = yinBuffer[t]
      let localMinTau = t

      while (t + 1 < yinBuffer.length && yinBuffer[t + 1] < yinBuffer[t]) {
        t++
        if (yinBuffer[t] < localMinValue) {
          localMinValue = yinBuffer[t]
          localMinTau = t
        }
      }

      // Found a minimum below threshold
      return sampleRate / localMinTau
    } else if (yinBuffer[t] < minValue) {
      minValue = yinBuffer[t]
      minTau = t
    }
  }

  // If no value found below threshold, use the minimum value we found
  if (minTau !== -1) {
    return sampleRate / minTau
  }

  return 0 // No pitch detected
}

// Get a smoothed frequency by averaging recent values with more weight on recent readings
export const getSmoothFrequency = (newFrequency: number, frequencyBuffer: number[]): number => {
  // If we don't have enough readings yet, just return the new frequency
  if (frequencyBuffer.length < 3) {
    return newFrequency
  }

  // First, check if the new frequency is an outlier
  if (frequencyBuffer.length >= 5) {
    const recentAvg = frequencyBuffer.slice(-5).reduce((sum, f) => sum + f, 0) / 5
    const percentDiff = Math.abs(newFrequency - recentAvg) / recentAvg

    // If the new frequency is more than 8% different from recent average,
    // it might be an outlier - give it less weight
    if (percentDiff > 0.08) {
      // Apply a weighted average that's more responsive to changes
      let weightedSum = newFrequency * 3 // Increased weight for new value
      let weightSum = 3

      frequencyBuffer.forEach((freq, index) => {
        const weight = Math.pow(index + 2, 1.2) // Reduced exponent for more responsiveness
        weightedSum += freq * weight
        weightSum += weight
      })

      return weightedSum / weightSum
    }
  }

  // Normal case - apply a weighted average with more weight to recent values
  // Simplified calculation for better performance
  const weights = [4, 3, 2, 1.5, 1.2, 1, 0.8, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1, 0.05, 0.02, 0.01]
  let weightedSum = 0
  let weightSum = 0

  // Use the most recent values with predefined weights
  const recentValues = frequencyBuffer.slice(-weights.length)
  for (let i = 0; i < recentValues.length; i++) {
    const weight = weights[weights.length - 1 - i] || 0.01
    weightedSum += recentValues[i] * weight
    weightSum += weight
  }

  return weightedSum / weightSum
}

