"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { AudioAnalyzer } from "@/utils/audio-analyzer"
import { NoteDetector } from "@/utils/note-detector"
import { getRMS, MIN_FREQUENCY, MAX_FREQUENCY } from "@/utils/audio-processing"
import { DEFAULT_A4_FREQ } from "@/utils/note-utils"
import type { FrequencyRange } from "@/utils/frequency-classifier"

// Signal detection parameters - optimized values
const SIGNAL_THRESHOLD = 0.004 // Increased from 0.003 to reduce sensitivity
const SIGNAL_HOLD_TIME = 600 // Increased from 500ms for more stability
const INACTIVITY_TIMEOUT = 2000 // Reduced to 2 seconds
const FORCE_CHECK_INTERVAL = 300 // More frequent checks
const NOTE_LOCK_THRESHOLD = 2 // Require 2 consecutive detections for more stability
const NOTE_CHANGE_THRESHOLD = 3 // Higher threshold for changing notes
const LOCKED_NOTE_CHANGE_THRESHOLD = 2 // Keep at 2
const SUSTAIN_SIGNAL_THRESHOLD = 0.0015 // Increased from 0.001 for less jitter
const CENTS_CHANGE_THRESHOLD = 0.8 // Increased from 0.5 to reduce jitter
const LOCKED_CENTS_CHANGE_THRESHOLD = 0.3 // Increased from 0.2 for stability

// For smooth transitions between nearby notes (like C to C#)
const NOTE_PROXIMITY_THRESHOLD = 2.0 // Notes within 2 semitones are considered "nearby"
const NEARBY_NOTE_CHANGE_THRESHOLD = 3 // Higher threshold for changing between nearby notes

// Adaptive threshold settings
const LOCKED_THRESHOLD_REDUCTION = 0.8 // Less reduction when locked
const VERY_LOW_THRESHOLD_REDUCTION = 0.7 // Less reduction for low frequencies

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

  // At the top, add this debounce timer ref
  const tuningStatusTimerRef = useRef<number | null>(null)

  // Reset display to default state
  const resetDisplayToDefault = useCallback(() => {
    // Clear any pending tuning status updates
    if (tuningStatusTimerRef.current) {
      window.clearTimeout(tuningStatusTimerRef.current)
      tuningStatusTimerRef.current = null
    }
    
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

    // Reset the note detector if it exists
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
    // Clear any pending tuning status updates when thresholds change
    if (tuningStatusTimerRef.current) {
      window.clearTimeout(tuningStatusTimerRef.current)
      tuningStatusTimerRef.current = null
    }
    
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
        if (frequency > MIN_FREQUENCY && frequency < MAX_FREQUENCY && noteDetectorRef.current) {
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

          // Always display the detected frequency and note right away
          // This makes the tuner feel more responsive
          setCurrentFrequency(noteInfo.frequency)
          setDisplayFrequency(noteInfo.smoothedFrequency)
          setCurrentNote(noteInfo.note)
          setCurrentNoteWithoutOctave(noteInfo.noteName)
          setCurrentOctave(noteInfo.octave)

          // Get smoothed cents value
          const smoothedCents = getSmoothCents(noteInfo.cents)
          
          // Update cents and tuning status immediately
          setCents(smoothedCents)
          setTuningStatus(smoothedCents < -10 ? "flat" : smoothedCents > 10 ? "sharp" : "in-tune")
          lastCentsRef.current = smoothedCents

          // Implement note locking and stability logic
          const detectedNote = noteInfo.note

          // Initialize counter for this note if it doesn't exist
          if (!noteDetectionCounterRef.current[detectedNote]) {
            noteDetectionCounterRef.current[detectedNote] = 0
          }

          // Increment counter for this note
          noteDetectionCounterRef.current[detectedNote]++

          // If we don't have a locked note yet, check if we should lock
          if (!currentLockedNoteRef.current) {
            // Use a lower lock threshold for all frequencies
            const lockThreshold = 1
            
            // If we've detected this note enough times, lock onto it
            if (noteDetectionCounterRef.current[detectedNote] >= lockThreshold) {
              currentLockedNoteRef.current = detectedNote
              noteChangeCounterRef.current = 0
              setIsNoteLocked(true)
              lastNoteTimeRef.current = Date.now()
            }
          }
          // If the detected note matches our locked note
          else if (currentLockedNoteRef.current === detectedNote) {
            // Reset the change counter
            noteChangeCounterRef.current = 0
            setIsNoteLocked(true)
          }
          // If we have a locked note and the detected note is different
          else {
            noteChangeCounterRef.current++
            
            // Check if the new note is close to the current locked note (e.g., C to C#)
            const isNearbyNote = isCloseNote(currentLockedNoteRef.current, detectedNote)
            
            // Use a higher threshold for nearby notes to prevent sporadic changes
            const changeThreshold = isNearbyNote ? NEARBY_NOTE_CHANGE_THRESHOLD : 2
            
            // If we've detected a different note consistently, switch to it
            if (noteChangeCounterRef.current >= changeThreshold) {
              // To make transitions smoother, briefly set tuning status to null
              // This creates a visual transition effect
              setTuningStatus(null)
              
              // Short timeout to create a visual transition before showing the new note
              setTimeout(() => {
                currentLockedNoteRef.current = detectedNote
                noteChangeCounterRef.current = 0
                
                // Reset counters for other notes
                Object.keys(noteDetectionCounterRef.current).forEach((note) => {
                  if (note !== detectedNote) {
                    noteDetectionCounterRef.current[note] = 0
                  }
                })
                
                // Reset cents buffer
                centsBufferRef.current = [smoothedCents]
                lastNoteTimeRef.current = Date.now()
              }, 50)
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
      if (tuningStatusTimerRef.current) {
        window.clearTimeout(tuningStatusTimerRef.current)
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

  // Add this helper function to determine if two notes are close to each other
  const isCloseNote = (note1: string | null, note2: string | null): boolean => {
    if (!note1 || !note2) return false
    
    // Get the note names without octaves
    const getBaseNote = (note: string) => note.replace(/\d+$/, '');
    
    const baseNote1 = getBaseNote(note1);
    const baseNote2 = getBaseNote(note2);
    
    // Common notes in order
    const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    // Also handle flat notation
    const flatNotes = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
    
    // Try to find positions in both arrays
    let pos1 = notes.indexOf(baseNote1);
    if (pos1 === -1) pos1 = flatNotes.indexOf(baseNote1);
    
    let pos2 = notes.indexOf(baseNote2);
    if (pos2 === -1) pos2 = flatNotes.indexOf(baseNote2);
    
    if (pos1 === -1 || pos2 === -1) return false;
    
    // Calculate the shortest distance in the circle of notes
    const diff = Math.min(
      Math.abs(pos1 - pos2),
      Math.abs(pos1 - pos2 + 12) % 12,
      Math.abs(pos1 - pos2 - 12) % 12
    );
    
    return diff <= NOTE_PROXIMITY_THRESHOLD;
  }

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

