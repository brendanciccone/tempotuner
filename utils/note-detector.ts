import { findClosestNote, type NoteInfo } from "@/utils/note-utils"
import { 
  getMedianFrequency, 
  isFrequencyConsistent, 
  correctOctaveError,
  FREQUENCY_BUFFER_SIZE 
} from "@/utils/audio-processing"

export interface NoteDetectionResult {
  note: string
  noteName: string
  octave: number
  frequency: number
  smoothedFrequency: number
  cents: number
  tuningStatus: "flat" | "sharp" | "in-tune"
  confidence: number // 0-1 indicating how stable the frequency detection is
  isLocked: boolean // True when hysteresis has confirmed this note
}

/**
 * NoteDetector class handles pitch-to-note conversion with smoothing
 * 
 * Uses a simple median filter approach which is more robust than
 * complex weighted averages for removing outliers while maintaining
 * responsiveness.
 */
export class NoteDetector {
  private frequencyBuffer: number[] = []
  private readonly bufferSize: number
  private lastValidNoteInfo: NoteInfo | null = null // Store full note info for hysteresis
  private noteHoldCounter: number = 0
  private readonly noteHoldThreshold: number = 2 // Require 2 consistent readings to change note

  constructor(bufferSize = FREQUENCY_BUFFER_SIZE) {
    this.bufferSize = bufferSize
  }

  /**
   * Detect the musical note from a frequency
   * Uses median filtering and octave error correction for stability
   */
  detectNote(frequency: number, referenceFreq: number, useFlats: boolean): NoteDetectionResult | null {
    if (frequency <= 0) return null

    // Correct potential octave errors based on recent history
    const correctedFrequency = correctOctaveError(frequency, this.frequencyBuffer)

    // Check consistency with recent readings
    const isConsistent = isFrequencyConsistent(correctedFrequency, this.frequencyBuffer)

    // Add to buffer
    this.frequencyBuffer.push(correctedFrequency)
    if (this.frequencyBuffer.length > this.bufferSize) {
      this.frequencyBuffer.shift()
    }

    // Calculate smoothed frequency using median filter
    const smoothedFrequency = getMedianFrequency(this.frequencyBuffer)

    // Find the closest note
    const noteInfo = findClosestNote(smoothedFrequency, referenceFreq, useFlats)

    // Calculate confidence based on consistency and buffer fill
    const bufferFillRatio = this.frequencyBuffer.length / this.bufferSize
    const consistencyScore = isConsistent ? 1 : 0.5
    const confidence = bufferFillRatio * consistencyScore

    // Implement simple note hysteresis to prevent jitter
    const currentNote = noteInfo.note
    
    // Handle initial state: require consistent readings before displaying first note
    if (this.lastValidNoteInfo === null) {
      this.noteHoldCounter++
      // Only set the initial note after seeing it consistently
      if (this.noteHoldCounter >= this.noteHoldThreshold) {
        this.lastValidNoteInfo = noteInfo
        this.noteHoldCounter = 0
      } else {
        // Not enough consistent readings yet - return null to indicate "still detecting"
        return null
      }
    } else if (this.lastValidNoteInfo.note !== currentNote) {
      // Different note detected - apply hysteresis before switching
      this.noteHoldCounter++
      if (this.noteHoldCounter >= this.noteHoldThreshold) {
        // Enough consistent readings of new note - switch to it
        this.lastValidNoteInfo = noteInfo
        this.noteHoldCounter = 0
      } else {
        // Not enough readings - return the LOCKED note info (not the new one)
        // Calculate cents from current frequency relative to the locked note's EXACT frequency
        // Use exactFrequency (nominal note frequency like 440Hz for A4), not the detected frequency
        const lockedNoteExactFreq = this.lastValidNoteInfo.exactFrequency
        const cents = Math.round(1200 * Math.log2(smoothedFrequency / lockedNoteExactFreq))
        const tuningStatus: "flat" | "sharp" | "in-tune" = 
          cents < -5 ? "flat" : cents > 5 ? "sharp" : "in-tune"
        
        return {
          ...this.lastValidNoteInfo,
          frequency: smoothedFrequency, // Update to current detected frequency
          cents,
          tuningStatus,
          smoothedFrequency: Math.round(smoothedFrequency * 10) / 10,
          confidence,
          isLocked: true, // Note is locked by hysteresis
        }
      }
    } else {
      // Same note as before - reset counter and update the stored info
      this.noteHoldCounter = 0
      this.lastValidNoteInfo = noteInfo
    }

    return {
      ...noteInfo,
      smoothedFrequency: Math.round(smoothedFrequency * 10) / 10,
      confidence,
      isLocked: true, // Note confirmed by hysteresis
    }
  }

  /**
   * Reset the detector state
   * Call this when the signal is lost
   */
  reset(): void {
    this.frequencyBuffer = []
    this.lastValidNoteInfo = null
    this.noteHoldCounter = 0
  }

  /**
   * Get the current buffer fill level (0-1)
   * Useful for UI to show detection confidence
   */
  getBufferFillRatio(): number {
    return this.frequencyBuffer.length / this.bufferSize
  }
}
