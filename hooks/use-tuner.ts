"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { AudioAnalyzer } from "@/utils/audio-analyzer"
import { NoteDetector } from "@/utils/note-detector"
import { getRMS, MIN_FREQUENCY, MAX_FREQUENCY } from "@/utils/audio-processing"
import { DEFAULT_A4_FREQ } from "@/utils/note-utils"

// Timing constants
const SIGNAL_HOLD_TIME = 600 // ms to hold display after signal drops (longer hold feels less jumpy)
const ANALYSIS_INTERVAL = 35 // ms between analyses (~28 fps, feeds EMA smoother more frequently)

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

    // Check signal level against adaptive threshold
    const rms = getRMS(buffer)
    const threshold = audioAnalyzerRef.current.getEffectiveThreshold()
    const hasSignal = rms > threshold

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
      // No signal — feed RMS to noise floor tracker so it adapts to ambient noise
      audioAnalyzerRef.current.updateNoiseFloor(rms)

      // Start hold timer if not already running
      if (!signalHoldTimerRef.current && signalDetectedRef.current) {
        signalHoldTimerRef.current = window.setTimeout(() => {
          resetDisplay()
          signalHoldTimerRef.current = null
        }, SIGNAL_HOLD_TIME)
      }
    }
  }, [resetDisplay])

  /**
   * Stop the tuner and release all resources
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

  // Resume AudioContext when user returns to the tab (handles iOS Safari "interrupted" state)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && audioAnalyzerRef.current) {
        audioAnalyzerRef.current.resume()
      }
    }
    document.addEventListener("visibilitychange", handleVisibilityChange)
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange)
  }, [])

  // Initialize tuner on mount, request mic permissions immediately
  useEffect(() => {
    let active = true

    const init = async () => {
      if (!audioAnalyzerRef.current) {
        audioAnalyzerRef.current = new AudioAnalyzer(setError)
      }
      if (!noteDetectorRef.current) {
        noteDetectorRef.current = new NoteDetector()
      }

      const success = await audioAnalyzerRef.current.initialize()

      // Bail out if the effect was cleaned up during the async initialization
      // (e.g. React strict mode double-mount or tab switch)
      if (!active || !success) return

      // Start analysis loop using setInterval for consistent timing
      // This is more predictable than requestAnimationFrame for audio processing
      analysisIntervalRef.current = window.setInterval(analyzeAudio, ANALYSIS_INTERVAL)
    }

    init().catch((err) => {
      if (active) {
        console.error("Tuner initialization failed:", err)
        setError("Failed to initialize tuner. Please reload the page.")
      }
    })

    return () => {
      active = false
      stopTuner()
    }
  }, [analyzeAudio, stopTuner])

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
