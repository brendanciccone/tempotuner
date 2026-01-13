"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { AudioAnalyzer } from "@/utils/audio-analyzer"
import { NoteDetector } from "@/utils/note-detector"
import { getRMS, MIN_FREQUENCY, MAX_FREQUENCY, SIGNAL_THRESHOLD } from "@/utils/audio-processing"
import { DEFAULT_A4_FREQ } from "@/utils/note-utils"

// Timing constants
const SIGNAL_HOLD_TIME = 400 // ms to hold display after signal drops
const ANALYSIS_INTERVAL = 50 // ms between analyses (20 fps)

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

/**
 * useTuner hook - Main tuner logic
 * 
 * Simplified architecture:
 * 1. AudioAnalyzer handles microphone input and pitch detection (YIN algorithm)
 * 2. NoteDetector handles pitch-to-note conversion with simple median filtering
 * 3. This hook manages state and the analysis loop
 */
export function useTuner(): [TunerState, TunerActions] {
  // Display state
  const [currentFrequency, setCurrentFrequency] = useState<number | null>(null)
  const [displayFrequency, setDisplayFrequency] = useState<number | null>(null)
  const [currentNote, setCurrentNote] = useState<string | null>(null)
  const [currentNoteWithoutOctave, setCurrentNoteWithoutOctave] = useState<string | null>(null)
  const [currentOctave, setCurrentOctave] = useState<number | null>(null)
  const [tuningStatus, setTuningStatus] = useState<"flat" | "sharp" | "in-tune" | null>(null)
  const [cents, setCents] = useState<number>(0)
  const [signalDetected, setSignalDetected] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isNoteLocked, setIsNoteLocked] = useState(false)

  // Settings state
  const [useFlats, setUseFlats] = useState(false)
  const [showOctave, setShowOctave] = useState(false)
  const [referenceFreq, setReferenceFreq] = useState(DEFAULT_A4_FREQ)

  // Refs for audio processing (don't trigger re-renders)
  const audioAnalyzerRef = useRef<AudioAnalyzer | null>(null)
  const noteDetectorRef = useRef<NoteDetector | null>(null)
  const analysisIntervalRef = useRef<number | null>(null)
  const signalHoldTimerRef = useRef<number | null>(null)
  const lastSignalTimeRef = useRef<number>(0)
  const signalDetectedRef = useRef(false)

  // Keep refs to current settings for use in analysis loop
  const useFlatsRef = useRef(useFlats)
  const referenceFreqRef = useRef(referenceFreq)

  // Sync refs with state
  useEffect(() => {
    useFlatsRef.current = useFlats
  }, [useFlats])

  useEffect(() => {
    referenceFreqRef.current = referenceFreq
  }, [referenceFreq])

  /**
   * Reset display to default state
   */
  const resetDisplay = useCallback(() => {
    setCurrentNote(null)
    setCurrentNoteWithoutOctave(null)
    setCurrentOctave(null)
    setTuningStatus(null)
    setCents(0)
    signalDetectedRef.current = false
    setSignalDetected(false)
    setCurrentFrequency(null)
    setDisplayFrequency(null)
    setIsNoteLocked(false)

    // Reset the note detector
    if (noteDetectorRef.current) {
      noteDetectorRef.current.reset()
    }
  }, [])

  /**
   * Main analysis function - called on each frame
   */
  const analyzeAudio = useCallback(() => {
    if (!audioAnalyzerRef.current || !noteDetectorRef.current) return

    // Get audio buffer
    const buffer = audioAnalyzerRef.current.getAudioData()
    if (!buffer) return

    // Check signal level
    const rms = getRMS(buffer)
    const hasSignal = rms > SIGNAL_THRESHOLD

    if (hasSignal) {
      // Update last signal time
      lastSignalTimeRef.current = Date.now()

      // Clear any pending hold timer
      if (signalHoldTimerRef.current) {
        window.clearTimeout(signalHoldTimerRef.current)
        signalHoldTimerRef.current = null
      }

      // Detect pitch
      const frequency = audioAnalyzerRef.current.detectPitch(buffer)

      // Process if we have a valid frequency
      if (frequency > MIN_FREQUENCY && frequency < MAX_FREQUENCY) {
        // Get note info with smoothing
        const noteInfo = noteDetectorRef.current.detectNote(
          frequency,
          referenceFreqRef.current,
          useFlatsRef.current
        )

        if (noteInfo) {
          // Update state and ref
          signalDetectedRef.current = true
          setSignalDetected(true)
          setCurrentFrequency(frequency)
          setDisplayFrequency(noteInfo.smoothedFrequency)
          setCurrentNote(noteInfo.note)
          setCurrentNoteWithoutOctave(noteInfo.noteName)
          setCurrentOctave(noteInfo.octave)
          setCents(noteInfo.cents)
          setTuningStatus(noteInfo.tuningStatus)
          setIsNoteLocked(noteInfo.isLocked)
        }
      }
    } else {
      // No signal - start hold timer if not already running
      // Use ref instead of state to avoid callback recreation
      if (!signalHoldTimerRef.current && signalDetectedRef.current) {
        signalHoldTimerRef.current = window.setTimeout(() => {
          resetDisplay()
          signalHoldTimerRef.current = null
        }, SIGNAL_HOLD_TIME)
      }
    }
  }, [resetDisplay])

  /**
   * Start the tuner
   */
  const startTuner = useCallback(async () => {
    // Create audio analyzer
    if (!audioAnalyzerRef.current) {
      audioAnalyzerRef.current = new AudioAnalyzer(setError)
    }

    // Create note detector
    if (!noteDetectorRef.current) {
      noteDetectorRef.current = new NoteDetector()
    }

    // Initialize audio
    const success = await audioAnalyzerRef.current.initialize()
    if (!success) return

    // Start analysis loop using setInterval for consistent timing
    // This is more predictable than requestAnimationFrame for audio processing
    analysisIntervalRef.current = window.setInterval(analyzeAudio, ANALYSIS_INTERVAL)
  }, [analyzeAudio])

  /**
   * Stop the tuner
   */
  const stopTuner = useCallback(() => {
    // Stop analysis loop
    if (analysisIntervalRef.current) {
      window.clearInterval(analysisIntervalRef.current)
      analysisIntervalRef.current = null
    }

    // Clear hold timer
    if (signalHoldTimerRef.current) {
      window.clearTimeout(signalHoldTimerRef.current)
      signalHoldTimerRef.current = null
    }

    // Clean up audio
    if (audioAnalyzerRef.current) {
      audioAnalyzerRef.current.cleanup()
      audioAnalyzerRef.current = null
    }

    resetDisplay()
  }, [resetDisplay])

  // Initialize and cleanup
  useEffect(() => {
    // Small delay to ensure component is mounted
    const initTimer = setTimeout(() => {
      startTuner()
    }, 100)

    return () => {
      clearTimeout(initTimer)
      stopTuner()
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
    setReferenceFreq((prev) => {
      const newFreq = Math.min(460, Math.max(420, prev + increment))
      return Number.parseFloat(newFreq.toFixed(1))
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
