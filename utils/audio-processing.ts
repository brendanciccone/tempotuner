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
  // Apply a low-pass filter to the buffer for clearer low frequency analysis
  const filteredBuffer = applyLowPassFilter(buffer)

  // Find peaks in the waveform with improved detection
  const peaks: number[] = []
  const step = 2 // Reduced from 4 for better precision with low frequencies
  let lastPeakIndex = -100 // To avoid detecting peaks too close together
  
  // Find peaks with adaptive threshold based on local signal strength
  const rms = getRMS(filteredBuffer)
  const adaptiveThreshold = Math.max(0.01, rms * 0.3) // Adjust threshold based on signal strength
  
  for (let i = step; i < filteredBuffer.length - step; i += step) {
    // Check if this point is higher than neighbors and exceeds the adaptive threshold
    if (filteredBuffer[i] > filteredBuffer[i - step] && 
        filteredBuffer[i] > filteredBuffer[i + step] && 
        filteredBuffer[i] > adaptiveThreshold && 
        i - lastPeakIndex > 10) { // Minimum distance between peaks
      
      // Find the precise peak through interpolation
      const refinedIndex = refineLocalPeak(filteredBuffer, i)
      peaks.push(refinedIndex)
      lastPeakIndex = i
    }
  }

  if (peaks.length < 3) return 0

  // Calculate distances between peaks with more robust filtering
  const peakDistances: number[] = []
  for (let i = 1; i < peaks.length; i++) {
    peakDistances.push(peaks[i] - peaks[i - 1])
  }

  // Filter out outliers using interquartile range method
  const sortedDistances = [...peakDistances].sort((a, b) => a - b)
  const q1Index = Math.floor(sortedDistances.length * 0.25)
  const q3Index = Math.floor(sortedDistances.length * 0.75)
  const q1 = sortedDistances[q1Index]
  const q3 = sortedDistances[q3Index]
  const iqr = q3 - q1
  const lowerBound = Math.max(5, q1 - iqr * 1.5) // Enforce minimum distance
  const upperBound = q3 + iqr * 1.5
  
  // Filter distances within reasonable range
  const filteredDistances = peakDistances.filter(dist => dist >= lowerBound && dist <= upperBound)

  if (filteredDistances.length >= 2) {
    // Calculate average period from valid distances
    const avgPeriod = filteredDistances.reduce((sum, val) => sum + val, 0) / filteredDistances.length
    
    // Apply correction factor for low frequencies
    // This helps adjust for potential bias in the peak detection
    const correctionFactor = 0.985 // Slight correction to avoid being consistently sharp
    
    return (sampleRate / avgPeriod) * correctionFactor
  }

  return 0 // Could not detect a very low frequency
}

// Helper function to find the precise location of a peak through quadratic interpolation
const refineLocalPeak = (buffer: Float32Array, peakIndex: number): number => {
  if (peakIndex <= 0 || peakIndex >= buffer.length - 1) {
    return peakIndex
  }
  
  const a = buffer[peakIndex - 1]
  const b = buffer[peakIndex]
  const c = buffer[peakIndex + 1]
  
  // Quadratic interpolation formula
  const offset = 0.5 * (a - c) / (a - 2 * b + c)
  
  // Sanity check - only apply if reasonable
  if (Math.abs(offset) < 1) {
    return peakIndex + offset
  }
  
  return peakIndex
}

// Apply a simple low-pass filter to the buffer to focus on low frequencies
const applyLowPassFilter = (buffer: Float32Array): Float32Array => {
  const filtered = new Float32Array(buffer.length)
  const alpha = 0.2 // Filter coefficient (higher = more smoothing)
  
  filtered[0] = buffer[0]
  for (let i = 1; i < buffer.length; i++) {
    filtered[i] = alpha * buffer[i] + (1 - alpha) * filtered[i - 1]
  }
  
  return filtered
}

// Zero-crossing method for low frequency detection - optimized for low frequencies
export const detectPitchZeroCrossing = (buffer: Float32Array, sampleRate: number): number => {
  // First try specialized very low frequency detection
  const veryLowFreq = detectVeryLowFrequency(buffer, sampleRate)
  if (veryLowFreq > 0) {
    return veryLowFreq
  }

  // Find zero crossings with improved interpolation
  const crossings: number[] = []
  const step = 1 // No step for accuracy with low frequencies
  for (let i = step; i < buffer.length; i += step) {
    if ((buffer[i] >= 0 && buffer[i - step] < 0) || (buffer[i] < 0 && buffer[i - step] >= 0)) {
      // Improved interpolation for more accurate crossing point
      const t = i - buffer[i] / (buffer[i] - buffer[i - step])
      
      // Only add high-quality crossings (where the signal has good slope)
      const slope = Math.abs(buffer[i] - buffer[i - step])
      if (slope > 0.001) { // Filter out crossings with very low slope (noisy)
        crossings.push(t)
      }
    }
  }

  // Calculate periods between zero crossings
  const periods: number[] = []

  // For low frequencies, analyze every 2nd crossing for more stable period calculation
  for (let i = 2; i < crossings.length; i += 2) {
    periods.push(crossings[i] - crossings[i - 2])
  }

  // If we don't have enough periods, return 0
  if (periods.length < 3) return 0

  // Improved filter for more reliable period detection
  // Remove outliers using interquartile range (IQR) method
  const sortedPeriods = [...periods].sort((a, b) => a - b)
  const q1Index = Math.floor(sortedPeriods.length * 0.25)
  const q3Index = Math.floor(sortedPeriods.length * 0.75)
  const q1 = sortedPeriods[q1Index]
  const q3 = sortedPeriods[q3Index]
  const iqr = q3 - q1
  const lowerBound = q1 - iqr * 1.5
  const upperBound = q3 + iqr * 1.5
  
  // Filter periods within IQR bounds
  const filteredPeriods = sortedPeriods.filter(p => p >= lowerBound && p <= upperBound)
  
  // If we don't have enough periods after filtering, fall back to median
  if (filteredPeriods.length < 2) {
    const medianPeriod = sortedPeriods[Math.floor(sortedPeriods.length / 2)]
    return sampleRate / medianPeriod
  }
  
  // Use the mean of the filtered periods for better accuracy
  const meanPeriod = filteredPeriods.reduce((sum, p) => sum + p, 0) / filteredPeriods.length
  
  // Convert period to frequency with improved precision
  return sampleRate / meanPeriod
}

// Improved YIN algorithm for better pitch detection
export const detectPitchYIN = (buffer: Float32Array, sampleRate: number): number => {
  // Early exit for silence or near-silence to save CPU
  const rms = getRMS(buffer)
  if (rms < 0.0008) {
    return 0
  }

  // Remove DC offset to improve autocorrelation quality
  const bufferSize = buffer.length
  let mean = 0
  for (let i = 0; i < bufferSize; i++) {
    mean += buffer[i]
  }
  mean /= bufferSize

  // Use a normalized working buffer without DC component
  const work = new Float32Array(bufferSize)
  for (let i = 0; i < bufferSize; i++) {
    work[i] = buffer[i] - mean
  }

  // Allocate YIN buffer once per call for the needed tau range
  const maxLag = Math.floor(bufferSize / 2)
  const yinBuffer = new Float32Array(maxLag)

  // Limit tau to a musically sensible range to reduce complexity
  const minFreq = Math.max(30, MIN_FREQUENCY) // avoid ultra-low that won't fit current window reliably
  const maxFreq = Math.min(2000, MAX_FREQUENCY) // typical upper bound for fundamental detection
  const tauMin = Math.max(2, Math.floor(sampleRate / maxFreq))
  const tauMax = Math.min(maxLag - 1, Math.floor(sampleRate / minFreq))

  if (tauMin >= tauMax) {
    return 0
  }

  // Step 1: Difference function (optimized range and adaptive inner step)
  // Use a slightly larger inner step at high sample rates to reduce CPU
  const innerStep = sampleRate >= 48000 ? 2 : 1
  for (let tau = tauMin; tau <= tauMax; tau++) {
    let sum = 0
    // Compute squared difference between the signal and a delayed version
    for (let i = 0; i + tau < bufferSize; i += innerStep) {
      const delta = work[i] - work[i + tau]
      sum += delta * delta
    }
    yinBuffer[tau] = sum * innerStep // compensate for skipped samples
  }

  // Step 2: Cumulative mean normalized difference function (CMNDF)
  const threshold = 0.05
  let runningSum = 0
  yinBuffer[0] = 1
  for (let tau = 1; tau <= tauMax; tau++) {
    // If we didn't compute this tau (below tauMin), keep it as 1 to ignore
    if (tau < tauMin) {
      yinBuffer[tau] = 1
      continue
    }

    runningSum += yinBuffer[tau]
    if (runningSum === 0) {
      yinBuffer[tau] = 1
      continue
    }
    yinBuffer[tau] = (yinBuffer[tau] * tau) / runningSum
  }

  // Step 3: Find best local minimum within [tauMin, tauMax]
  const minTau = findBestLocalMinimum(yinBuffer, threshold, tauMin, tauMax)
  if (minTau > 0) {
    // Parabolic refinement for sub-sample precision
    const betterTau = refinePitchEstimate(yinBuffer, minTau)
    return sampleRate / betterTau
  }

  return 0
}

// Helper function to find the best local minimum in the YIN buffer
const findBestLocalMinimum = (yinBuffer: Float32Array, threshold: number, tauMin: number, tauMax: number): number => {
  let minValue = 1
  let minTau = -1

  // Scan only the valid tau range
  for (let t = Math.max(2, tauMin); t <= tauMax; t++) {
    if (yinBuffer[t] < threshold) {
      // Descend to the local minimum within this valley
      let localMinValue = yinBuffer[t]
      let localMinTau = t

      while (t + 1 <= tauMax && yinBuffer[t + 1] < yinBuffer[t]) {
        t++
        if (yinBuffer[t] < localMinValue) {
          localMinValue = yinBuffer[t]
          localMinTau = t
        }
      }

      return localMinTau
    }

    if (yinBuffer[t] < minValue) {
      minValue = yinBuffer[t]
      minTau = t
    }
  }

  return minTau
}

// Parabolic interpolation to refine the pitch estimate for higher accuracy
const refinePitchEstimate = (yinBuffer: Float32Array, tau: number): number => {
  // Make sure we can perform the interpolation
  if (tau < 1 || tau >= yinBuffer.length - 1) {
    return tau;
  }
  
  const y_prev = yinBuffer[tau - 1]
  const y_curr = yinBuffer[tau]
  const y_next = yinBuffer[tau + 1]
  
  // Apply parabolic interpolation formula
  const delta = 0.5 * (y_next - y_prev) / (2 * y_curr - y_prev - y_next)
  
  // Only apply refinement if the parabolic estimate is reasonable
  if (Math.abs(delta) < 1) {
    return tau + delta;
  }
  
  return tau;
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

