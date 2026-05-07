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
  /** True when the AudioContext is suspended and needs a user-gesture resume (typical on iOS Safari). */
  needsUserGesture: boolean
  /** True while initial mic permission request is in flight. */
  isInitializing: boolean
}

export interface TunerActions {
  toggleNotation: () => void
  toggleOctaveDisplay: () => void
  adjustReferenceFreq: (increment: number) => void
  resetReferenceFreq: () => void
  /** Resume a suspended AudioContext (call from a click handler on iOS Safari). */
  startWithGesture: () => Promise<void>
  /** Retry initialisation after a permission error or other failure. */
  retry: () => Promise<void>
}

/**
 * useTuner hook - Main tuner logic
 *
 * Architecture:
 * 1. AudioAnalyzer handles microphone input and pitch detection (YIN algorithm)
 * 2. NoteDetector handles pitch-to-note conversion with median filtering + EMA
 * 3. This hook manages state, the analysis loop, and gesture/retry flows
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
  const [needsUserGesture, setNeedsUserGesture] = useState(false)
  const [isInitializing, setIsInitializing] = useState(true)

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
  const isUnmountedRef = useRef(false)

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

    if (noteDetectorRef.current) {
      noteDetectorRef.current.reset()
    }
  }, [])

  /**
   * Main analysis function - called on each frame
   */
  const analyzeAudio = useCallback(() => {
    if (!audioAnalyzerRef.current || !noteDetectorRef.current) return

    const buffer = audioAnalyzerRef.current.getAudioData()
    if (!buffer) return

    const rms = getRMS(buffer)
    const threshold = audioAnalyzerRef.current.getEffectiveThreshold()
    const hasSignal = rms > threshold

    if (hasSignal) {
      lastSignalTimeRef.current = Date.now()

      if (signalHoldTimerRef.current) {
        window.clearTimeout(signalHoldTimerRef.current)
        signalHoldTimerRef.current = null
      }

      const frequency = audioAnalyzerRef.current.detectPitch(buffer)

      if (frequency > MIN_FREQUENCY && frequency < MAX_FREQUENCY) {
        const noteInfo = noteDetectorRef.current.detectNote(
          frequency,
          referenceFreqRef.current,
          useFlatsRef.current
        )

        if (noteInfo) {
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

      if (!signalHoldTimerRef.current && signalDetectedRef.current) {
        signalHoldTimerRef.current = window.setTimeout(() => {
          resetDisplay()
          signalHoldTimerRef.current = null
        }, SIGNAL_HOLD_TIME)
      }
    }
  }, [resetDisplay])

  /**
   * Start the analysis loop. Idempotent.
   */
  const startAnalysisLoop = useCallback(() => {
    if (analysisIntervalRef.current !== null) return
    // setInterval gives more predictable timing for audio than rAF (which throttles
    // when the tab is hidden — but visibility-change handles resume separately)
    analysisIntervalRef.current = window.setInterval(analyzeAudio, ANALYSIS_INTERVAL)
  }, [analyzeAudio])

  /**
   * Stop the analysis loop (without tearing down the AudioContext).
   */
  const stopAnalysisLoop = useCallback(() => {
    if (analysisIntervalRef.current !== null) {
      window.clearInterval(analysisIntervalRef.current)
      analysisIntervalRef.current = null
    }
    if (signalHoldTimerRef.current !== null) {
      window.clearTimeout(signalHoldTimerRef.current)
      signalHoldTimerRef.current = null
    }
  }, [])

  /**
   * Release audio resources without touching React state. Safe to call after unmount.
   *
   * Returns a Promise that resolves once the AudioContext has fully closed.
   * The retry flow MUST await this before creating a new context (otherwise we
   * race the previous context's close()). Unmount can fire-and-forget — see usage.
   */
  const cleanupResources = useCallback(async (): Promise<void> => {
    stopAnalysisLoop()

    const analyzer = audioAnalyzerRef.current
    audioAnalyzerRef.current = null
    if (analyzer) {
      await analyzer.cleanup()
    }
  }, [stopAnalysisLoop])

  /**
   * Stop the tuner: release resources AND reset the visible UI. Use this for
   * user-initiated stops (e.g. retry). On unmount call cleanupResources()
   * directly so we don't schedule setState on an unmounted component.
   */
  const stopTuner = useCallback(async (): Promise<void> => {
    await cleanupResources()
    resetDisplay()
  }, [cleanupResources, resetDisplay])

  /**
   * Initialise the analyzer + detector and start the analysis loop based on the result.
   * Used by the mount effect and the retry action.
   */
  const initialise = useCallback(async () => {
    if (!audioAnalyzerRef.current) {
      audioAnalyzerRef.current = new AudioAnalyzer((message) => {
        if (!isUnmountedRef.current) setError(message)
      })
    }
    if (!noteDetectorRef.current) {
      noteDetectorRef.current = new NoteDetector()
    }

    setError(null)
    setNeedsUserGesture(false)
    setIsInitializing(true)

    const result = await audioAnalyzerRef.current.initialize()

    if (isUnmountedRef.current) return

    setIsInitializing(false)

    if (result === "success") {
      startAnalysisLoop()
    } else if (result === "needs-gesture") {
      setNeedsUserGesture(true)
    }
    // "error" — message already delivered through the onError callback
  }, [startAnalysisLoop])

  /**
   * Resume a suspended AudioContext from inside a user-gesture handler.
   * Required by iOS Safari when the page loads without prior interaction.
   */
  const startWithGesture = useCallback(async () => {
    if (!audioAnalyzerRef.current) {
      await initialise()
      return
    }

    const running = await audioAnalyzerRef.current.resume()
    if (running) {
      setNeedsUserGesture(false)
      startAnalysisLoop()
    }
  }, [initialise, startAnalysisLoop])

  /**
   * Retry initialisation after a failure. Tears down any partial state first
   * so we get a clean attempt — important after a permission denial where
   * the user may have changed their browser setting.
   */
  const retry = useCallback(async () => {
    // Must await stopTuner so the previous AudioContext fully closes before we
    // create a new one (Web Audio spec: creation-blocking resources are only
    // released after close() resolves).
    await stopTuner()
    await initialise()
  }, [initialise, stopTuner])

  // Resume AudioContext when user returns to the tab (handles iOS Safari "interrupted" state)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible" || !audioAnalyzerRef.current) return

      audioAnalyzerRef.current.resume().then((running) => {
        if (isUnmountedRef.current) return
        if (running) {
          setNeedsUserGesture(false)
          startAnalysisLoop()
        } else if (audioAnalyzerRef.current?.isSuspended()) {
          // Couldn't resume without a gesture — surface the prompt again
          setNeedsUserGesture(true)
        }
      })
    }
    document.addEventListener("visibilitychange", handleVisibilityChange)
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange)
  }, [startAnalysisLoop])

  // Initialize tuner on mount, request mic permissions immediately
  useEffect(() => {
    isUnmountedRef.current = false

    initialise().catch((err) => {
      if (!isUnmountedRef.current) {
        console.error("Tuner initialization failed:", err)
        setError("Couldn't start the tuner. Please try again.")
        setIsInitializing(false)
      }
    })

    return () => {
      isUnmountedRef.current = true
      // Resource-only cleanup on unmount — resetDisplay() would schedule setState
      // on an unmounted component. UI reset isn't needed since the component is gone.
      // Fire-and-forget: we don't want to block React's unmount on close() resolving.
      void cleanupResources()
    }
  }, [initialise, cleanupResources])

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
    needsUserGesture,
    isInitializing,
  }

  const actions: TunerActions = {
    toggleNotation,
    toggleOctaveDisplay,
    adjustReferenceFreq,
    resetReferenceFreq,
    startWithGesture,
    retry,
  }

  return [state, actions]
}
