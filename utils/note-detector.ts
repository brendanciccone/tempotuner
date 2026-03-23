import { findClosestNote, type NoteInfo } from "@/utils/note-utils"
import {
  getMedianFrequency,
  isFrequencyConsistent,
  correctOctaveError,
  FREQUENCY_BUFFER_SIZE,
  CENTS_SMOOTHING,
  FREQUENCY_SMOOTHING,
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
 * Multi-layer stabilization:
 * 1. Octave error correction against recent history
 * 2. Reject inconsistent readings (don't add to buffer)
 * 3. Median filter for outlier rejection
 * 4. Exponential moving average (EMA) for smooth cents/frequency display
 * 5. Note hysteresis to prevent note-name flickering
 */
export class NoteDetector {
  private frequencyBuffer: number[] = []
  private readonly bufferSize: number
  private lastValidNoteInfo: NoteInfo | null = null
  private noteHoldCounter: number = 0
  private readonly noteHoldThreshold: number = 3 // Require 3 consistent readings to change note (up from 2)
  private smoothedCents: number = 0
  private smoothedFrequency: number = 0
  private hasSmoothedValues: boolean = false
  private rejectionStreak: number = 0 // Track consecutive rejections to allow genuine note changes

  constructor(bufferSize = FREQUENCY_BUFFER_SIZE) {
    this.bufferSize = bufferSize
  }

  /**
   * Detect the musical note from a frequency
   * Uses median filtering, EMA smoothing, and octave error correction for stability
   */
  detectNote(frequency: number, referenceFreq: number, useFlats: boolean): NoteDetectionResult | null {
    if (frequency <= 0) return null

    // Correct potential octave errors based on recent history
    const correctedFrequency = correctOctaveError(frequency, this.frequencyBuffer)

    // Check consistency with recent readings
    const isConsistent = isFrequencyConsistent(correctedFrequency, this.frequencyBuffer)

    if (!isConsistent && this.frequencyBuffer.length >= 3) {
      // Reject inconsistent readings to keep the buffer clean
      // But track rejections — if we get many in a row, the player likely changed notes
      this.rejectionStreak++
      if (this.rejectionStreak < 4) {
        // Still within rejection window — use the smoothed values if available
        if (this.lastValidNoteInfo && this.hasSmoothedValues) {
          return this.buildLockedResult(this.lastValidNoteInfo, this.smoothedFrequency, this.smoothedCents)
        }
        return null
      }
      // Too many rejections — clear buffer and accept the new frequency as a genuine change
      this.frequencyBuffer = []
      this.rejectionStreak = 0
    } else {
      this.rejectionStreak = 0
    }

    // Add to buffer
    this.frequencyBuffer.push(correctedFrequency)
    if (this.frequencyBuffer.length > this.bufferSize) {
      this.frequencyBuffer.shift()
    }

    // Calculate smoothed frequency using median filter
    const medianFrequency = getMedianFrequency(this.frequencyBuffer)

    // Apply EMA smoothing on top of median for silky-smooth display
    if (this.hasSmoothedValues) {
      this.smoothedFrequency = this.smoothedFrequency + FREQUENCY_SMOOTHING * (medianFrequency - this.smoothedFrequency)
    } else {
      this.smoothedFrequency = medianFrequency
      this.hasSmoothedValues = true
    }

    // Find the closest note using the EMA-smoothed frequency
    const noteInfo = findClosestNote(this.smoothedFrequency, referenceFreq, useFlats)

    // Apply EMA smoothing to cents for stable needle display
    const rawCents = noteInfo.cents
    this.smoothedCents = this.smoothedCents + CENTS_SMOOTHING * (rawCents - this.smoothedCents)
    const displayCents = Math.round(this.smoothedCents)

    // Recalculate tuning status from smoothed cents
    const tuningStatus: "flat" | "sharp" | "in-tune" =
      displayCents < -5 ? "flat" : displayCents > 5 ? "sharp" : "in-tune"

    // Calculate confidence
    const bufferFillRatio = this.frequencyBuffer.length / this.bufferSize
    const confidence = bufferFillRatio

    // Implement note hysteresis to prevent jitter
    const currentNote = noteInfo.note

    // Handle initial state
    if (this.lastValidNoteInfo === null) {
      this.noteHoldCounter++
      if (this.noteHoldCounter >= this.noteHoldThreshold) {
        this.lastValidNoteInfo = noteInfo
        this.noteHoldCounter = 0
      } else {
        return null
      }
    } else if (this.lastValidNoteInfo.note !== currentNote) {
      // Different note detected — apply hysteresis before switching
      this.noteHoldCounter++
      if (this.noteHoldCounter >= this.noteHoldThreshold) {
        // Switch to new note and reset EMA cents to avoid lingering pull from old note
        this.lastValidNoteInfo = noteInfo
        this.noteHoldCounter = 0
        this.smoothedCents = rawCents
      } else {
        // Not enough readings — return locked note with updated smoothed values
        return this.buildLockedResult(this.lastValidNoteInfo, this.smoothedFrequency, displayCents)
      }
    } else {
      // Same note — reset counter and update stored info
      this.noteHoldCounter = 0
      this.lastValidNoteInfo = noteInfo
    }

    return {
      ...noteInfo,
      cents: displayCents,
      tuningStatus,
      smoothedFrequency: Math.round(this.smoothedFrequency * 10) / 10,
      confidence,
      isLocked: true,
    }
  }

  /**
   * Build a result using the locked (hysteresis-held) note with updated frequency/cents
   */
  private buildLockedResult(lockedNote: NoteInfo, smoothedFreq: number, displayCents: number): NoteDetectionResult {
    const tuningStatus: "flat" | "sharp" | "in-tune" =
      displayCents < -5 ? "flat" : displayCents > 5 ? "sharp" : "in-tune"

    return {
      ...lockedNote,
      frequency: smoothedFreq,
      cents: displayCents,
      tuningStatus,
      smoothedFrequency: Math.round(smoothedFreq * 10) / 10,
      confidence: this.frequencyBuffer.length / this.bufferSize,
      isLocked: true,
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
    this.smoothedCents = 0
    this.smoothedFrequency = 0
    this.hasSmoothedValues = false
    this.rejectionStreak = 0
  }

  /**
   * Get the current buffer fill level (0-1)
   */
  getBufferFillRatio(): number {
    return this.frequencyBuffer.length / this.bufferSize
  }
}
