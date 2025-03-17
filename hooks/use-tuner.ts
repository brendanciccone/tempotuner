"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { AudioAnalyzer } from "@/utils/audio-analyzer"
import { NoteDetector } from "@/utils/note-detector"
import { getRMS, MIN_FREQUENCY, MAX_FREQUENCY } from "@/utils/audio-processing"
import { DEFAULT_A4_FREQ } from "@/utils/note-utils"
import type { FrequencyRange } from "@/utils/frequency-classifier"

// Signal detection parameters - optimized values
const SIGNAL_THRESHOLD = 0.0025 // Reduced for better sensitivity
const SIGNAL_HOLD_TIME = 800 // Time to hold the note after signal is lost
const INACTIVITY_TIMEOUT = 5000 // 5 seconds before resetting display
const FORCE_CHECK_INTERVAL = 500 // Check for signal every 500ms
const NOTE_LOCK_THRESHOLD = 3 // Reduced from 4 to 3 for faster locking
const NOTE_CHANGE_THRESHOLD = 4 // Reduced from 5 to 4 for better responsiveness
const LOCKED_NOTE_CHANGE_THRESHOLD = 2 // For faster response when locked
const SUSTAIN_SIGNAL_THRESHOLD = 0.0008 // Reduced from 0.001 for better sensitivity
const CENTS_CHANGE_THRESHOLD = 0.3 // Threshold for updating cents display
const LOCKED_CENTS_CHANGE_THRESHOLD = 0.1 // More sensitive when locked

// Adaptive threshold settings
const LOCKED_THRESHOLD_REDUCTION = 0.6 // Increased from 0.5 for more sensitivity when locked
const VERY_LOW_THRESHOLD_REDUCTION = 0.5 // Increased from 0.4 for better low frequency detection

export interface TunerState {
  currentFrequency: number | null
  displayFrequency: number | null
  currentNote: string | null
  currentNoteWithoutOctave: string | null
  currentOctave: number | null
  tuningStatus: "flat" | "sharp" | "in-tune" | null
  cents: number
  signalDetected: boolean
  error: string | null
  useFlats: boolean
  showOctave: boolean
  referenceFreq: number
  isNoteLocked: boolean
}

export interface TunerActions {
  toggleNotation: () => void
  toggleOctaveDisplay: () => void
  adjustReferenceFreq: (increment: number) => void
  resetReferenceFreq: () => void
}

export function useTuner(): [TunerState, TunerActions] {
  // State
  const [currentFrequency, setCurrentFrequency] = useState<number | null>(null)
  const [displayFrequency, setDisplayFrequency] = useState<number | null>(null)
  const [currentNote, setCurrentNote] = useState<string | null>(null)
  const [currentNoteWithoutOctave, setCurrentNoteWithoutOctave] = useState<string | null>(null)
  const [currentOctave, setCurrentOctave] = useState<number | null>(null)
  const [tuningStatus, setTuningStatus] = useState<"flat" | "sharp" | "in-tune" | null>(null)
  const [cents, setCents] = useState<number>(0)
  const [error, setError] = useState<string | null>(null)
  const [useFlats, setUseFlats] = useState(false)
  const [showOctave, setShowOctave] = useState(false)
  const [signalDetected, setSignalDetected] = useState(false)
  const [referenceFreq, setReferenceFreq] = useState(DEFAULT_A4_FREQ)
  const [isNoteLocked, setIsNoteLocked] = useState(false)

  // Refs for audio processing
  const audioAnalyzerRef = useRef<AudioAnalyzer | null>(null)
  const noteDetectorRef = useRef<NoteDetector | null>(null)
  const animationFrameRef = useRef<number | null>(null)

  // Refs for signal processing and stability
  const lastNoteTimeRef = useRef<number>(0)
  const signalHoldTimerRef = useRef<number | null>(null)
  const inactivityTimerRef = useRef<number | null>(null)
  const forceCheckTimerRef = useRef<number | null>(null)
  const lastSignalTimeRef = useRef<number>(Date.now())
  const lastRmsRef = useRef<number>(0)

  // Refs for note stability
  const noteDetectionCounterRef = useRef<{ [note: string]: number }>({})
  const currentLockedNoteRef = useRef<string | null>(null)
  const noteChangeCounterRef = useRef<number>(0)
  const lastCentsRef = useRef<number>(0)
  const centsBufferRef = useRef<number[]>([])
  const lastFrequencyRef = useRef<number | null>(null)
  const frequencyRangeRef = useRef<FrequencyRange>("normal")
  const currentThresholdRef = useRef<number>(SIGNAL_THRESHOLD)

  // Reset display to default state
  const resetDisplayToDefault = useCallback(() => {
    setCurrentNote(null)
    setCurrentNoteWithoutOctave(null)
    setCurrentOctave(null)
    setTuningStatus(null)
    setCents(0)
    setSignalDetected(false)
    setCurrentFrequency(null)
    setDisplayFrequency(null)
    setIsNoteLocked(false)

    // Clear all buffers and counters
    centsBufferRef.current = []
    noteDetectionCounterRef.current = {}
    currentLockedNoteRef.current = null
    noteChangeCounterRef.current = 0
    lastFrequencyRef.current = null
    frequencyRangeRef.current = "normal"
    currentThresholdRef.current = SIGNAL_THRESHOLD

    // Reset the note detector
    if (noteDetectorRef.current) {
      noteDetectorRef.current.reset()
    }
  }, [])

  // Force check for signal presence periodically
  const startForceCheckTimer = useCallback(() => {
    if (forceCheckTimerRef.current) {
      clearInterval(forceCheckTimerRef.current)
    }

    forceCheckTimerRef.current = window.setInterval(() => {
      // If the last RMS value is very low, consider it silence
      if (lastRmsRef.current < currentThresholdRef.current * 0.3) {
        // If it's been more than SIGNAL_HOLD_TIME since the last signal
        if (Date.now() - lastSignalTimeRef.current > SIGNAL_HOLD_TIME) {
          resetDisplayToDefault()
        }
      }
    }, FORCE_CHECK_INTERVAL)
  }, [resetDisplayToDefault])

  // Get smoothed cents value with adaptive smoothing based on frequency range
  const getSmoothCents = useCallback((newCents: number): number => {
    // Add to buffer
    centsBufferRef.current.push(newCents)
    if (centsBufferRef.current.length > 5) {
      // Keep last 5 cents values
      centsBufferRef.current.shift()
    }

    // If we don't have enough readings, return the new value
    if (centsBufferRef.current.length < 3) {
      return newCents
    }

    // Apply weighted average with more weight to recent values
    // Use less smoothing for low frequencies
    const isLowFreq = frequencyRangeRef.current !== "normal"

    // Simplified calculation for better performance
    const weights = isLowFreq
      ? [3, 1.5, 0.5, 0.2, 0.1] // More weight to recent values for low frequencies
      : [2, 1.5, 1, 0.8, 0.5] // More balanced for normal frequencies

    let weightedSum = 0
    let weightSum = 0

    for (let i = 0; i < centsBufferRef.current.length; i++) {
      const weight = weights[i] || 0.1
      weightedSum += centsBufferRef.current[centsBufferRef.current.length - 1 - i] * weight
      weightSum += weight
    }

    return Math.round(weightedSum / weightSum)
  }, [])

  // Update the signal threshold based on current state
  const updateAdaptiveThreshold = useCallback(() => {
    // Start with the base threshold
    let newThreshold = SIGNAL_THRESHOLD

    // If we have a locked note, reduce the threshold to make it more sensitive
    // to small changes during fine tuning
    if (isNoteLocked) {
      newThreshold *= LOCKED_THRESHOLD_REDUCTION

      // If it's a very low frequency, reduce even more
      if (frequencyRangeRef.current === "very-low") {
        newThreshold *= VERY_LOW_THRESHOLD_REDUCTION
      }
    }

    // Update the current threshold
    currentThresholdRef.current = newThreshold
  }, [isNoteLocked])

  // Start the tuner
  const startTuner = useCallback(async () => {
    // Create the audio analyzer if it doesn't exist
    if (!audioAnalyzerRef.current) {
      audioAnalyzerRef.current = new AudioAnalyzer(setError)
    }

    // Create the note detector if it doesn't exist
    if (!noteDetectorRef.current) {
      noteDetectorRef.current = new NoteDetector()
    }

    // Initialize the audio analyzer
    const success = await audioAnalyzerRef.current.initialize()
    if (!success) return

    // Start the force check timer
    startForceCheckTimer()

    // Start analyzing with a slight delay to ensure everything is set up
    setTimeout(() => {
      analyzeAudio()
    }, 100)
  }, [startForceCheckTimer])

  // Stop the tuner
  const stopTuner = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }

    if (forceCheckTimerRef.current) {
      clearInterval(forceCheckTimerRef.current)
      forceCheckTimerRef.current = null
    }

    if (audioAnalyzerRef.current) {
      audioAnalyzerRef.current.cleanup()
      audioAnalyzerRef.current = null
    }

    resetDisplayToDefault()
  }, [resetDisplayToDefault])

  // Analyze audio data
  const analyzeAudio = useCallback(() => {
    if (!audioAnalyzerRef.current || !noteDetectorRef.current) return

    const analyze = () => {
      if (!audioAnalyzerRef.current) return

      // Get audio data
      const buffer = audioAnalyzerRef.current.getAudioData()
      if (!buffer) {
        animationFrameRef.current = requestAnimationFrame(analyze)
        return
      }

      // Check if there's a significant signal
      const rms = getRMS(buffer)

      // Store the last RMS value for the force check timer
      lastRmsRef.current = rms

      // Update adaptive threshold based on current state
      updateAdaptiveThreshold()

      // Use a lower threshold for maintaining signal detection than for initial detection
      const isInitialSignal = rms > currentThresholdRef.current * 0.8
      const isSustainingSignal = signalDetected && rms > SUSTAIN_SIGNAL_THRESHOLD
      const isSignalPresent = isInitialSignal || isSustainingSignal

      if (isSignalPresent) {
        // Update last signal time
        lastSignalTimeRef.current = Date.now()

        // Clear any existing hold timer when we detect a new signal
        if (signalHoldTimerRef.current) {
          window.clearTimeout(signalHoldTimerRef.current)
          signalHoldTimerRef.current = null
        }

        // Clear inactivity timer
        if (inactivityTimerRef.current) {
          window.clearTimeout(inactivityTimerRef.current)
          inactivityTimerRef.current = null
        }

        setSignalDetected(true)

        // Detect pitch
        const frequency = audioAnalyzerRef.current.detectPitch(buffer)

        // Only process if we have a meaningful frequency
        if (frequency > MIN_FREQUENCY && frequency < MAX_FREQUENCY) {
          // Detect note
          const noteInfo = noteDetectorRef.current.detectNote(frequency, referenceFreq, useFlats)
          if (!noteInfo) {
            animationFrameRef.current = requestAnimationFrame(analyze)
            return
          }

          // Update frequency range reference
          frequencyRangeRef.current = noteInfo.frequencyRange

          // Store the frequency internally
          lastFrequencyRef.current = noteInfo.smoothedFrequency

          // Get smoothed cents value
          const smoothedCents = getSmoothCents(noteInfo.cents)

          // Implement note locking and stability logic
          const detectedNote = noteInfo.note

          // Initialize counter for this note if it doesn't exist
          if (!noteDetectionCounterRef.current[detectedNote]) {
            noteDetectionCounterRef.current[detectedNote] = 0
          }

          // Increment counter for this note
          noteDetectionCounterRef.current[detectedNote]++

          // If we have a locked note and the detected note is different
          if (currentLockedNoteRef.current && currentLockedNoteRef.current !== detectedNote) {
            noteChangeCounterRef.current++

            // Use a lower threshold for note changes when already locked
            // Even lower for low frequencies which can be harder to detect consistently
            let changeThreshold = NOTE_CHANGE_THRESHOLD
            if (isNoteLocked) {
              changeThreshold = LOCKED_NOTE_CHANGE_THRESHOLD
            }
            if (noteInfo.frequencyRange !== "normal") {
              changeThreshold = Math.max(1, changeThreshold - 1) // Even lower for low frequencies
            }

            // If we've detected a different note consistently, switch to it
            if (noteChangeCounterRef.current >= changeThreshold) {
              // Only switch if the new note has enough detections
              const lockThreshold =
                noteInfo.frequencyRange !== "normal" ? Math.max(2, NOTE_LOCK_THRESHOLD - 1) : NOTE_LOCK_THRESHOLD

              if (noteDetectionCounterRef.current[detectedNote] >= lockThreshold) {
                currentLockedNoteRef.current = detectedNote
                noteChangeCounterRef.current = 0

                // Reset counters for all notes except the new one
                Object.keys(noteDetectionCounterRef.current).forEach((note) => {
                  if (note !== detectedNote) {
                    noteDetectionCounterRef.current[note] = 0
                  }
                })

                // Update note display
                setCurrentNote(noteInfo.note)
                setCurrentNoteWithoutOctave(noteInfo.noteName)
                setCurrentOctave(noteInfo.octave)
                lastNoteTimeRef.current = Date.now()

                // Reset cents buffer when changing notes
                centsBufferRef.current = [smoothedCents]

                // Update frequency display now that we're locked
                setCurrentFrequency(noteInfo.frequency)
                setDisplayFrequency(noteInfo.smoothedFrequency)
              }
            }
          }
          // If we don't have a locked note yet
          else if (!currentLockedNoteRef.current) {
            // Use a lower lock threshold for low frequencies
            const lockThreshold =
              noteInfo.frequencyRange !== "normal" ? Math.max(2, NOTE_LOCK_THRESHOLD - 1) : NOTE_LOCK_THRESHOLD

            // If we've detected this note enough times, lock onto it
            if (noteDetectionCounterRef.current[detectedNote] >= lockThreshold) {
              currentLockedNoteRef.current = detectedNote
              noteChangeCounterRef.current = 0
              setIsNoteLocked(true)

              // Update note display
              setCurrentNote(noteInfo.note)
              setCurrentNoteWithoutOctave(noteInfo.noteName)
              setCurrentOctave(noteInfo.octave)
              lastNoteTimeRef.current = Date.now()

              // Update frequency display now that we're locked
              setCurrentFrequency(noteInfo.frequency)
              setDisplayFrequency(noteInfo.smoothedFrequency)
            }
          }
          // If the detected note matches our locked note
          else {
            // Reset the change counter
            noteChangeCounterRef.current = 0

            // Update frequency display since we're locked
            setCurrentFrequency(noteInfo.frequency)

            // Smooth the display frequency with higher responsiveness when locked
            // Use even higher responsiveness for low frequencies
            const smoothingFactor =
              noteInfo.frequencyRange !== "normal"
                ? 0.8 // Increased from 0.7 for faster response
                : isNoteLocked
                  ? 0.6 // Increased from 0.5 for faster response
                  : 0.4

            setDisplayFrequency((prev) => {
              if (prev === null) return noteInfo.smoothedFrequency
              return prev + (noteInfo.smoothedFrequency - prev) * smoothingFactor
            })

            // If the cents value has changed, update it with higher sensitivity
            // Use even higher sensitivity for low frequencies
            const centsChangeThreshold =
              noteInfo.frequencyRange !== "normal"
                ? 0.05
                : isNoteLocked
                  ? LOCKED_CENTS_CHANGE_THRESHOLD
                  : CENTS_CHANGE_THRESHOLD

            if (
              Math.abs(lastCentsRef.current - smoothedCents) > centsChangeThreshold ||
              Math.abs(cents - smoothedCents) > centsChangeThreshold
            ) {
              setCents(smoothedCents)
              setTuningStatus(smoothedCents < -5 ? "flat" : smoothedCents > 5 ? "sharp" : "in-tune")
              lastCentsRef.current = smoothedCents
            }
          }
        }
      } else if (signalDetected) {
        // If signal drops, set a timer to clear the display after a delay
        if (!signalHoldTimerRef.current) {
          signalHoldTimerRef.current = window.setTimeout(() => {
            resetDisplayToDefault()
            signalHoldTimerRef.current = null
          }, SIGNAL_HOLD_TIME)
        }
      } else {
        // If we're already in the default state and still no signal,
        // make sure all our state is properly reset
        if (currentNote !== null || currentFrequency !== null) {
          resetDisplayToDefault()
        }
      }

      animationFrameRef.current = requestAnimationFrame(analyze)
    }

    // Start the analysis loop
    analyze()
  }, [
    referenceFreq,
    useFlats,
    resetDisplayToDefault,
    currentNote,
    currentFrequency,
    signalDetected,
    cents,
    getSmoothCents,
    updateAdaptiveThreshold,
  ])

  // Initialize and cleanup
  useEffect(() => {
    // Start the tuner with a slight delay to ensure component is fully mounted
    const initTimer = setTimeout(() => {
      startTuner()
    }, 300)

    // Clean up function
    return () => {
      clearTimeout(initTimer)
      stopTuner()
      if (signalHoldTimerRef.current) {
        window.clearTimeout(signalHoldTimerRef.current)
      }
      if (inactivityTimerRef.current) {
        window.clearTimeout(inactivityTimerRef.current)
      }
      if (forceCheckTimerRef.current) {
        clearInterval(forceCheckTimerRef.current)
      }
    }
  }, [startTuner, stopTuner])

  // Actions
  const toggleNotation = useCallback(() => {
    setUseFlats((prev) => !prev)
  }, [])

  const toggleOctaveDisplay = useCallback(() => {
    setShowOctave((prev) => !prev)
  }, [])

  const adjustReferenceFreq = useCallback((increment: number) => {
    // Limit the range to 420-460 Hz (common range for A4)
    setReferenceFreq((prev) => {
      const newFreq = Math.min(460, Math.max(420, prev + increment))
      return Number.parseFloat(newFreq.toFixed(1)) // Round to 1 decimal place
    })
  }, [])

  const resetReferenceFreq = useCallback(() => {
    setReferenceFreq(DEFAULT_A4_FREQ)
  }, [])

  const state: TunerState = {
    currentFrequency,
    displayFrequency,
    currentNote,
    currentNoteWithoutOctave,
    currentOctave,
    tuningStatus,
    cents,
    signalDetected,
    error,
    useFlats,
    showOctave,
    referenceFreq,
    isNoteLocked,
  }

  const actions: TunerActions = {
    toggleNotation,
    toggleOctaveDisplay,
    adjustReferenceFreq,
    resetReferenceFreq,
  }

  return [state, actions]
}

