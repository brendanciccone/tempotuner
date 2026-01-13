// Frequency classification thresholds for reference
export const VERY_LOW_FREQUENCY_THRESHOLD = 100 // Below this is bass territory
export const LOW_FREQUENCY_THRESHOLD = 200 // Below this needs extra care

export type FrequencyRange = "very-low" | "low" | "normal"

/**
 * Check if a frequency is in the very low range (below 100Hz)
 * Bass guitars, low piano notes, etc.
 */
export const isVeryLowFrequency = (freq: number): boolean => freq < VERY_LOW_FREQUENCY_THRESHOLD

/**
 * Check if a frequency is in the low range (below 200Hz)
 * Guitar low E (82Hz), A string (110Hz), etc.
 */
export const isLowFrequency = (freq: number): boolean => freq < LOW_FREQUENCY_THRESHOLD

/**
 * Classify a frequency into a range category
 * Useful for adjusting detection parameters
 */
export const classifyFrequency = (frequency: number): FrequencyRange => {
  if (isVeryLowFrequency(frequency)) {
    return "very-low"
  } else if (isLowFrequency(frequency)) {
    return "low"
  } else {
    return "normal"
  }
}
