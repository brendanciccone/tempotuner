import { findClosestNote } from "@/utils/note-utils"
import { classifyFrequency, type FrequencyRange } from "@/utils/frequency-classifier"
import { getSmoothFrequency } from "@/utils/audio-processing"

export interface NoteDetectionResult {
  note: string
  noteName: string
  octave: number
  frequency: number
  smoothedFrequency: number
  cents: number
  tuningStatus: "flat" | "sharp" | "in-tune"
  frequencyRange: FrequencyRange
}

export class NoteDetector {
  private frequencyBuffer: number[] = []
  private readonly bufferSize: number

  constructor(bufferSize = 16) {
    this.bufferSize = bufferSize
  }

  detectNote(frequency: number, referenceFreq: number, useFlats: boolean): NoteDetectionResult | null {
    if (frequency <= 0) return null

    // Classify the frequency range
    const frequencyRange = classifyFrequency(frequency)

    // Add to buffer for smoothing
    this.frequencyBuffer.push(frequency)
    if (this.frequencyBuffer.length > this.bufferSize) {
      this.frequencyBuffer.shift()
    }

    // Apply appropriate smoothing based on frequency range
    const smoothedFrequency =
      frequencyRange !== "normal"
        ? frequency // Use raw frequency for low frequencies
        : getSmoothFrequency(frequency, this.frequencyBuffer)

    // Round to nearest 0.1 Hz for more stability
    const roundedFrequency = Math.round(smoothedFrequency * 10) / 10

    // Find the closest note
    const noteInfo = findClosestNote(smoothedFrequency, referenceFreq, useFlats)

    return {
      ...noteInfo,
      smoothedFrequency: roundedFrequency,
      frequencyRange,
    }
  }

  reset(): void {
    this.frequencyBuffer = []
  }
}

