import { VERY_LOW_FREQUENCY_THRESHOLD, LOW_FREQUENCY_THRESHOLD } from "@/utils/audio-processing"

export type FrequencyRange = "very-low" | "low" | "normal"

// Check if a frequency is in the very low range (below 100Hz)
export const isVeryLowFrequency = (freq: number): boolean => freq < VERY_LOW_FREQUENCY_THRESHOLD

// Check if a frequency is in the low range (below 200Hz)
export const isLowFrequency = (freq: number): boolean => freq < LOW_FREQUENCY_THRESHOLD

// Classify a frequency into a range category
export const classifyFrequency = (frequency: number): FrequencyRange => {
  if (isVeryLowFrequency(frequency)) {
    return "very-low"
  } else if (isLowFrequency(frequency)) {
    return "low"
  } else {
    return "normal"
  }
}

