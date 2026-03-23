import { findClosestNote, type NoteInfo } from "@/utils/note-utils"
import {
  getMedianFrequency,
  isFrequencyConsistent,
  correctOctaveError,
  centsFromFrequencies,
  FREQUENCY_BUFFER_SIZE,
} from "@/utils/audio-processing"

export interface NoteDetectionResult {
  note: string
  noteName: string
  octave: number
  frequency: number
  smoothedFrequency: number
  cents: number
  tuningStatus: "flat" | "sharp" | "in-tune"
  confidence: number
  isLocked: boolean
}

// EMA alpha bounds — alpha adapts between these based on how far the reading is from the smoothed value
const EMA_ALPHA_SLOW = 0.2 // Fine-tuning same note: very smooth needle
const EMA_ALPHA_FAST = 0.6 // Large change (new note settling): fast response
const EMA_ADAPT_THRESHOLD = 10 // Cents difference that triggers faster alpha

// Time-based rejection: reject inconsistent readings for up to this many ms before accepting a new note
const REJECTION_WINDOW_MS = 120

/**
 * NoteDetector class handles pitch-to-note conversion with smoothing
 *
 * Pipeline (order matters):
 * 1. Octave error correction against recent history
 * 2. Reject inconsistent readings (time-windowed, not frame-counted)
 * 3. Median filter for outlier rejection
 * 4. Note detection from median (NOT from EMA — so EMA doesn't delay note switching)
 * 5. Note hysteresis to prevent note-name flickering
 * 6. Cents computed against the LOCKED note's exact frequency (not the detected note)
 * 7. Adaptive EMA for smooth cents + frequency display
 */
export class NoteDetector {
  private frequencyBuffer: number[] = []
  private readonly bufferSize: number
  private lastValidNoteInfo: NoteInfo | null = null
  private noteHoldCounter: number = 0
  private readonly noteHoldThreshold: number = 3

  // EMA state
  private smoothedCents: number = 0
  private smoothedFrequency: number = 0
  private hasSmoothedValues: boolean = false

  // Time-based rejection instead of frame-counting
  private firstRejectionTime: number = 0
  private isRejecting: boolean = false

  constructor(bufferSize = FREQUENCY_BUFFER_SIZE) {
    this.bufferSize = bufferSize
  }

  /**
   * Compute adaptive EMA alpha — faster response for large changes, smoother for small ones.
   * This gives you fast note settling AND stable needle display in a single parameter.
   */
  private adaptiveAlpha(rawValue: number, smoothedValue: number): number {
    const diff = Math.abs(rawValue - smoothedValue)
    if (diff > EMA_ADAPT_THRESHOLD) return EMA_ALPHA_FAST
    // Linear interpolation between slow and fast based on how far off we are
    const t = diff / EMA_ADAPT_THRESHOLD
    return EMA_ALPHA_SLOW + t * (EMA_ALPHA_FAST - EMA_ALPHA_SLOW)
  }

  detectNote(frequency: number, referenceFreq: number, useFlats: boolean): NoteDetectionResult | null {
    if (frequency <= 0) return null

    const now = Date.now()

    // Correct potential octave errors based on recent history
    const correctedFrequency = correctOctaveError(frequency, this.frequencyBuffer)

    // Check consistency with recent readings
    const isConsistent = isFrequencyConsistent(correctedFrequency, this.frequencyBuffer)

    if (!isConsistent && this.frequencyBuffer.length >= 3) {
      if (!this.isRejecting) {
        // Start rejection window
        this.isRejecting = true
        this.firstRejectionTime = now
      }

      if (now - this.firstRejectionTime < REJECTION_WINDOW_MS) {
        // Still within rejection window — return locked values if available
        if (this.lastValidNoteInfo && this.hasSmoothedValues) {
          return this.buildLockedResult(this.lastValidNoteInfo, this.smoothedFrequency)
        }
        return null
      }

      // Rejection window expired — accept as genuine note change
      this.frequencyBuffer = []
      this.lastValidNoteInfo = null
      this.noteHoldCounter = 0
      this.isRejecting = false
    } else {
      this.isRejecting = false
    }

    // Add to buffer
    this.frequencyBuffer.push(correctedFrequency)
    if (this.frequencyBuffer.length > this.bufferSize) {
      this.frequencyBuffer.shift()
    }

    // Median frequency for note detection (NOT EMA — EMA would delay note switching)
    const medianFrequency = getMedianFrequency(this.frequencyBuffer)

    // Determine the note from median frequency
    const noteInfo = findClosestNote(medianFrequency, referenceFreq, useFlats)

    // Confidence based on buffer fill
    const confidence = this.frequencyBuffer.length / this.bufferSize

    // --- Note hysteresis ---
    const currentNote = noteInfo.note

    if (this.lastValidNoteInfo === null) {
      // Initial state: require consistent readings before displaying
      this.noteHoldCounter++
      if (this.noteHoldCounter >= this.noteHoldThreshold) {
        this.lastValidNoteInfo = noteInfo
        this.noteHoldCounter = 0
        // Initialize EMA from this first confirmed note
        this.smoothedCents = noteInfo.cents
        this.smoothedFrequency = medianFrequency
        this.hasSmoothedValues = true
      } else {
        return null
      }
    } else if (this.lastValidNoteInfo.note !== currentNote) {
      // Different note — apply hysteresis
      this.noteHoldCounter++
      if (this.noteHoldCounter >= this.noteHoldThreshold) {
        // Switch to new note
        this.lastValidNoteInfo = noteInfo
        this.noteHoldCounter = 0
        // Reset EMA to the new note's values so there's no pull from the old note
        this.smoothedCents = noteInfo.cents
        this.smoothedFrequency = medianFrequency
      } else {
        // Still locked on old note — compute cents against LOCKED note's exact frequency
        return this.buildLockedResult(this.lastValidNoteInfo, medianFrequency)
      }
    } else {
      // Same note — reset counter, update stored info
      this.noteHoldCounter = 0
      this.lastValidNoteInfo = noteInfo
    }

    // --- Compute display values against the confirmed note ---
    const lockedNote = this.lastValidNoteInfo
    const rawCents = centsFromFrequencies(medianFrequency, lockedNote.exactFrequency)

    // Adaptive EMA smoothing
    if (this.hasSmoothedValues) {
      const centsAlpha = this.adaptiveAlpha(rawCents, this.smoothedCents)
      this.smoothedCents += centsAlpha * (rawCents - this.smoothedCents)

      const freqAlpha = this.adaptiveAlpha(medianFrequency, this.smoothedFrequency)
      this.smoothedFrequency += freqAlpha * (medianFrequency - this.smoothedFrequency)
    } else {
      this.smoothedCents = rawCents
      this.smoothedFrequency = medianFrequency
      this.hasSmoothedValues = true
    }

    const displayCents = Math.round(this.smoothedCents)
    const tuningStatus: "flat" | "sharp" | "in-tune" =
      displayCents < -5 ? "flat" : displayCents > 5 ? "sharp" : "in-tune"

    return {
      ...lockedNote,
      frequency: medianFrequency,
      cents: displayCents,
      tuningStatus,
      smoothedFrequency: Math.round(this.smoothedFrequency * 10) / 10,
      confidence,
      isLocked: true,
    }
  }

  /**
   * Build a result for the locked note, computing cents from the current median
   * frequency against the locked note's exact frequency (not the detected note).
   */
  private buildLockedResult(lockedNote: NoteInfo, currentMedian: number): NoteDetectionResult {
    const rawCents = centsFromFrequencies(currentMedian, lockedNote.exactFrequency)

    // Still update EMA even while locked so the display stays smooth
    if (this.hasSmoothedValues) {
      const centsAlpha = this.adaptiveAlpha(rawCents, this.smoothedCents)
      this.smoothedCents += centsAlpha * (rawCents - this.smoothedCents)

      const freqAlpha = this.adaptiveAlpha(currentMedian, this.smoothedFrequency)
      this.smoothedFrequency += freqAlpha * (currentMedian - this.smoothedFrequency)
    } else {
      this.smoothedCents = rawCents
      this.smoothedFrequency = currentMedian
      this.hasSmoothedValues = true
    }

    const displayCents = Math.round(this.smoothedCents)
    const tuningStatus: "flat" | "sharp" | "in-tune" =
      displayCents < -5 ? "flat" : displayCents > 5 ? "sharp" : "in-tune"

    return {
      ...lockedNote,
      frequency: currentMedian,
      cents: displayCents,
      tuningStatus,
      smoothedFrequency: Math.round(this.smoothedFrequency * 10) / 10,
      confidence: this.frequencyBuffer.length / this.bufferSize,
      isLocked: true,
    }
  }

  reset(): void {
    this.frequencyBuffer = []
    this.lastValidNoteInfo = null
    this.noteHoldCounter = 0
    this.smoothedCents = 0
    this.smoothedFrequency = 0
    this.hasSmoothedValues = false
    this.isRejecting = false
    this.firstRejectionTime = 0
  }

  getBufferFillRatio(): number {
    return this.frequencyBuffer.length / this.bufferSize
  }
}
