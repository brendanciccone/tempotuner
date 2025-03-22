"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { AudioAnalyzer } from "@/utils/audio-analyzer"
import { NoteDetector } from "@/utils/note-detector"
import { getRMS, MIN_FREQUENCY, MAX_FREQUENCY } from "@/utils/audio-processing"
import { DEFAULT_A4_FREQ } from "@/utils/note-utils"
import type { FrequencyRange } from "@/utils/frequency-classifier"

// Signal detection parameters - optimized values
const SIGNAL_THRESHOLD = 0.004 // Base threshold
const SIGNAL_HOLD_TIME = 600 // Increased from 500ms for more stability
const INACTIVITY_TIMEOUT = 2000 // Reduced to 2 seconds
const FORCE_CHECK_INTERVAL = 300 // More frequent checks
const NOTE_LOCK_THRESHOLD = 2 // Require 2 consecutive detections for more stability
const NOTE_CHANGE_THRESHOLD = 3 // Higher threshold for changing notes
const LOCKED_NOTE_CHANGE_THRESHOLD = 2 // Keep at 2
const SUSTAIN_SIGNAL_THRESHOLD = 0.0012 // Reduced for better sustain detection
const CENTS_CHANGE_THRESHOLD = 0.8 // Increased from 0.5 to reduce jitter
const LOCKED_CENTS_CHANGE_THRESHOLD = 0.3 // Increased from 0.2 for stability

// Enhanced detection and display smoothness
const INITIAL_DETECTION_COUNT = 5 // Readings required before display update
const INITIAL_DISPLAY_THRESHOLD = 3 // Minimum readings before showing anything
const FREQUENCY_DISPLAY_UPDATE_RATE = 5 // Update display every N frames
const DISPLAY_RATE_LOCKED = 3 // Update display more frequently when locked
const NOTE_CONFIDENCE_THRESHOLD = 0.65 // Increased from 0.6 for more stability
const STABLE_TUNING_THRESHOLD = 8 // Readings needed when close to in-tune to consider it stable
const LOW_FREQUENCY_ADAPTATION_FACTOR = 1.5 // Increase stability requirements for low frequency notes

// For smooth transitions between nearby notes (like C to C#)
const NOTE_PROXIMITY_THRESHOLD = 2.0 // Notes within 2 semitones are considered "nearby"
const NEARBY_NOTE_CHANGE_THRESHOLD = 4 // Increased for better stability between nearby notes

// Adaptive threshold settings
const LOCKED_THRESHOLD_REDUCTION = 0.7 // Increased reduction to make locked state more sensitive
const FINE_TUNING_THRESHOLD_REDUCTION = 0.6 // Even higher sensitivity when near in-tune
const VERY_LOW_THRESHOLD_REDUCTION = 0.65 // Improved low frequency sensitivity
const SUSTAINED_NOTE_LOCK_BONUS = 2.0 // Bonus factor to make it harder to switch away from a sustained note

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

  // Add a ref to track the current useFlats value
  const useFlatsRef = useRef<boolean>(useFlats)
  
  // Add a ref to track the current referenceFreq value
  const referenceFreqRef = useRef<number>(referenceFreq)

  // Refs for signal processing and stability
  const lastNoteTimeRef = useRef<number>(0)
  const signalHoldTimerRef = useRef<number | null>(null)
  const inactivityTimerRef = useRef<number | null>(null)
  const forceCheckTimerRef = useRef<number | null>(null)
  const lastSignalTimeRef = useRef<number>(Date.now())
  const lastRmsRef = useRef<number>(0)
  const frameCounterRef = useRef<number>(0)
  const initialDetectionCounterRef = useRef<number>(0)
  const displayUpdateCounterRef = useRef<number>(0)
  const initialFrequencyBufferRef = useRef<number[]>([])

  // Refs for note stability
  const noteDetectionCounterRef = useRef<{ [note: string]: number }>({})
  const currentLockedNoteRef = useRef<string | null>(null)
  const noteChangeCounterRef = useRef<number>(0)
  const lastCentsRef = useRef<number>(0)
  const centsBufferRef = useRef<number[]>([])
  const lastFrequencyRef = useRef<number | null>(null)
  const frequencyRangeRef = useRef<FrequencyRange>("normal")
  const currentThresholdRef = useRef<number>(SIGNAL_THRESHOLD)
  const stableTuningCounterRef = useRef<number>(0)
  const lockedNoteTimeRef = useRef<number>(0)
  const noteHistoryRef = useRef<string[]>([])

  // At the top, add this debounce timer ref
  const tuningStatusTimerRef = useRef<number | null>(null)

  // Reset display to default state
  const resetDisplayToDefault = useCallback(() => {
    // Clear any pending tuning status updates
    if (tuningStatusTimerRef.current) {
      window.clearTimeout(tuningStatusTimerRef.current)
      tuningStatusTimerRef.current = null
    }
    
    // Clear all state in one batch to avoid inconsistencies
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

    // Reset counters and buffers for display smoothing
    frameCounterRef.current = 0
    initialDetectionCounterRef.current = 0
    displayUpdateCounterRef.current = 0
    initialFrequencyBufferRef.current = []

    // Reset additional stability counters
    stableTuningCounterRef.current = 0
    lockedNoteTimeRef.current = 0
    noteHistoryRef.current = []
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
    const isLocked = currentLockedNoteRef.current !== null
    const isStableTuning = stableTuningCounterRef.current >= STABLE_TUNING_THRESHOLD
    const isNearInTune = Math.abs(newCents) < 15

    // Enhanced smoothing algorithm with dynamic weights based on context
    const weights = isStableTuning
      ? isNearInTune
        ? [3, 2, 1.2, 0.8, 0.5] // More weight to recent values when near in-tune for responsive fine-tuning
        : [2, 2, 1.8, 1.5, 1.2] // More balanced weights when stable (prioritize stability)
      : isLocked
        ? isLowFreq
          ? [3.5, 2, 1, 0.3, 0.1] // More weight to recent values for low frequencies when locked
          : [2.5, 2, 1.5, 1, 0.5] // More balanced for normal frequencies when locked
        : isLowFreq
          ? [3, 1.5, 0.5, 0.2, 0.1] // Original weights for unlocked, low frequencies
          : [2, 1.5, 1, 0.8, 0.5]; // Original weights for unlocked, normal frequencies

    let weightedSum = 0
    let weightSum = 0

    // Check for outliers in cents values
    const nonOutlierValues = [...centsBufferRef.current];
    if (centsBufferRef.current.length >= 3) {
      const median = [...centsBufferRef.current].sort((a, b) => a - b)[Math.floor(centsBufferRef.current.length / 2)];
      
      // Adjust outlier threshold based on how close to in-tune we are
      // Tighter threshold when we're almost in tune for more precise readings
      const threshold = isNearInTune ? 3 : isLocked ? 5 : 8;
      
      // Remove outliers (values that deviate too much from median)
      for (let i = 0; i < nonOutlierValues.length; i++) {
        if (Math.abs(nonOutlierValues[i] - median) > threshold) {
          // Replace outlier with the median value
          nonOutlierValues[i] = median;
        }
      }
    }

    for (let i = 0; i < nonOutlierValues.length; i++) {
      const weight = weights[i] || 0.1
      weightedSum += nonOutlierValues[nonOutlierValues.length - 1 - i] * weight
      weightSum += weight
    }

    // When very close to in-tune, preserve small changes for fine tuning
    if (isStableTuning && Math.abs(newCents) < 5) {
      // Bias towards the most recent value more when we're very close to in-tune
      return Math.round((weightedSum / weightSum) * 0.7 + newCents * 0.3);
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
      
      // If the note is close to being in tune (within 15 cents), make it even more sensitive
      // to help detect small changes for fine tuning
      if (lastCentsRef.current !== undefined && Math.abs(lastCentsRef.current) < 15) {
        newThreshold *= FINE_TUNING_THRESHOLD_REDUCTION;
      }

      // If it's a very low frequency, adjust sensitivity appropriately
      if (frequencyRangeRef.current === "very-low") {
        newThreshold *= VERY_LOW_THRESHOLD_REDUCTION
      } else if (frequencyRangeRef.current === "low") {
        // Add a separate threshold for "low" range
        newThreshold *= 0.75;
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

      // Increment frame counter for display update rate limiting
      frameCounterRef.current++

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

        // Track if we actually have enough data to display
        const hasStableDetection = initialFrequencyBufferRef.current.length >= INITIAL_DISPLAY_THRESHOLD;
        const hasNoteToDisplay = currentNote !== null && currentLockedNoteRef.current !== null;
        
        // Only set signal detected if we're actually going to display a note
        // to avoid showing the "listening" indicator before we've settled on a note
        if (hasStableDetection || hasNoteToDisplay) {
          setSignalDetected(true)
        } else {
          // If we don't have a stable detection yet, explicitly set tuning status to null
          // to avoid showing "in tune" when no note is displayed
          setTuningStatus(null);
        }

        // Detect pitch
        const frequency = audioAnalyzerRef.current.detectPitch(buffer)

        // Only process if we have a meaningful frequency
        if (frequency > MIN_FREQUENCY && frequency < MAX_FREQUENCY && noteDetectorRef.current) {
          // Use the current value from the refs, which are always up-to-date
          const noteInfo = noteDetectorRef.current.detectNote(frequency, referenceFreqRef.current, useFlatsRef.current)
          if (!noteInfo) {
            animationFrameRef.current = requestAnimationFrame(analyze)
            return
          }

          // Update frequency range reference
          frequencyRangeRef.current = noteInfo.frequencyRange

          // Add to initial frequency buffer
          initialFrequencyBufferRef.current.push(noteInfo.smoothedFrequency)
          if (initialFrequencyBufferRef.current.length > INITIAL_DETECTION_COUNT * 2) {
            initialFrequencyBufferRef.current.shift()
          }

          // Keep a short history of detected notes for pattern analysis
          noteHistoryRef.current.push(noteInfo.note)
          if (noteHistoryRef.current.length > 10) {
            noteHistoryRef.current.shift()
          }

          // Store the frequency internally
          lastFrequencyRef.current = noteInfo.smoothedFrequency

          // Track the detected notes for stability analysis
          const detectedNote = noteInfo.note

          // Initialize counter for this note if it doesn't exist
          if (!noteDetectionCounterRef.current[detectedNote]) {
            noteDetectionCounterRef.current[detectedNote] = 0
          }

          // Increment counter for this note
          noteDetectionCounterRef.current[detectedNote]++

          // Count consecutive detections for initial stabilization
          if (!currentLockedNoteRef.current && detectedNote === noteInfo.note) {
            initialDetectionCounterRef.current++
          } else if (!currentLockedNoteRef.current) {
            initialDetectionCounterRef.current = 0
          }

          // Before displaying any note, make sure we have a predominant note
          // Analyze note distribution in the buffer to avoid jumping to random notes
          if (!currentLockedNoteRef.current && !isNoteLocked) {
            const totalDetections = Object.values(noteDetectionCounterRef.current).reduce((sum, count) => sum + count, 0);
            const mostFrequentNote = Object.entries(noteDetectionCounterRef.current)
              .sort((a, b) => b[1] - a[1])
              .shift();
              
            // Calculate frequency stability score - more steady readings = higher score
            const frequencyStability = calculateFrequencyStability(initialFrequencyBufferRef.current);
            
            // Calculate note pattern stability by checking consecutive occurrences
            const notePatternStability = calculateNotePatternStability(noteHistoryRef.current);
            
            // Adjust confidence requirements based on frequency range
            // Low frequencies need more consistent readings
            let frequencyAdjustmentFactor = 1.0;
            if (frequencyRangeRef.current === "very-low") {
              frequencyAdjustmentFactor = LOW_FREQUENCY_ADAPTATION_FACTOR;
            } else if (frequencyRangeRef.current === "low") {
              frequencyAdjustmentFactor = LOW_FREQUENCY_ADAPTATION_FACTOR * 0.8;
            }
            
            // Only proceed to display if we have a clearly predominant note with good stability
            const confidenceThreshold = NOTE_CONFIDENCE_THRESHOLD * frequencyAdjustmentFactor * (1 - (frequencyStability * 0.3));
            if (!mostFrequentNote || (mostFrequentNote[1] / totalDetections) < confidenceThreshold) {
              // Not enough confidence in any note yet, skip display updates
              // and explicitly set tuning status to null to avoid showing "in tune" without a note
              if (!currentNote) {
                setTuningStatus(null);
              }
              animationFrameRef.current = requestAnimationFrame(analyze)
              return;
            }

            // If close to being in tune, start building stability counter for fine tuning
            if (noteInfo.cents !== undefined && Math.abs(noteInfo.cents) < 15) {
              stableTuningCounterRef.current += 1;
            } else {
              stableTuningCounterRef.current = Math.max(0, stableTuningCounterRef.current - 1);
            }
          }

          // Determine if we should update the display
          let shouldUpdateDisplay = false;

          // If we have no locked note yet, wait for initial detection threshold
          if (!currentLockedNoteRef.current) {
            shouldUpdateDisplay = initialDetectionCounterRef.current >= INITIAL_DETECTION_COUNT;
          } else {
            // When locked, update at a more controlled rate
            const updateRate = isNoteLocked ? DISPLAY_RATE_LOCKED : FREQUENCY_DISPLAY_UPDATE_RATE;
            shouldUpdateDisplay = displayUpdateCounterRef.current % updateRate === 0;
          }

          // Update display if conditions are met
          if (shouldUpdateDisplay || frameCounterRef.current % FREQUENCY_DISPLAY_UPDATE_RATE === 0) {
            displayUpdateCounterRef.current++;

            // If we have enough initial detections, use a smoothed initial frequency
            if (initialFrequencyBufferRef.current.length >= INITIAL_DISPLAY_THRESHOLD) {
              // Calculate a median frequency for stable initial display
              const sortedFreqs = [...initialFrequencyBufferRef.current].sort((a, b) => a - b);
              const medianFreq = sortedFreqs[Math.floor(sortedFreqs.length / 2)];
              
              // Get smoothed cents value
              const smoothedCents = getSmoothCents(noteInfo.cents)
              
              // Always update these values together to ensure consistency
              // This prevents showing tuning status without a note
              setCents(smoothedCents)
              setTuningStatus(
                // Only set a tuning status if we're going to display a note
                detectedNote ? 
                  (smoothedCents < -10 ? "flat" : smoothedCents > 10 ? "sharp" : "in-tune") : 
                  null
              )
              lastCentsRef.current = smoothedCents
              
              // Make sure we only update all note-related state together to avoid inconsistencies
              setCurrentFrequency(noteInfo.frequency)
              setDisplayFrequency(medianFreq)
              setCurrentNote(detectedNote)
              setCurrentNoteWithoutOctave(noteInfo.noteName)
              setCurrentOctave(noteInfo.octave)

              // Ensure signal detected is set to true once we're displaying a note
              setSignalDetected(!!detectedNote)
            } else {
              // If we don't have enough readings yet, ensure we don't show a tuning status
              setTuningStatus(null);
              setCurrentNote(null);
              setCurrentNoteWithoutOctave(null);
              setCurrentOctave(null);
            }
          }

          // If we don't have a locked note yet, check if we should lock
          if (!currentLockedNoteRef.current) {
            // If we've detected this note enough times, lock onto it
            // Start locking earlier for better response
            if (initialDetectionCounterRef.current >= INITIAL_DETECTION_COUNT / 2) {
              currentLockedNoteRef.current = detectedNote
              noteChangeCounterRef.current = 0
              setIsNoteLocked(true)
              lastNoteTimeRef.current = Date.now()
              lockedNoteTimeRef.current = Date.now()
              
              // Reset detection counters for other notes when locking to reduce chance of immediate switching
              Object.keys(noteDetectionCounterRef.current).forEach(note => {
                if (note !== detectedNote) {
                  noteDetectionCounterRef.current[note] = 0;
                }
              });
            }
          }
          // If the detected note matches our locked note
          else if (currentLockedNoteRef.current === detectedNote) {
            // Reset the change counter
            noteChangeCounterRef.current = 0
            setIsNoteLocked(true)
            
            // If close to being in tune, increase stability counter
            if (Math.abs(lastCentsRef.current) < 15) {
              stableTuningCounterRef.current = Math.min(STABLE_TUNING_THRESHOLD + 5, stableTuningCounterRef.current + 1);
            }
          }
          // If we have a locked note and the detected note is different
          else {
            noteChangeCounterRef.current++
            
            // Check if the new note is close to the current locked note (e.g., C to C#)
            const isNearbyNote = isCloseNote(currentLockedNoteRef.current, detectedNote)
            
            // Calculate how long we've been locked on the current note
            const lockDuration = Date.now() - lockedNoteTimeRef.current;
            
            // Calculate consistency factor - how consistently we're detecting the new note
            const totalDetections = Object.values(noteDetectionCounterRef.current).reduce((sum, count) => sum + count, 0) || 1;
            const consistencyFactor = noteDetectionCounterRef.current[detectedNote] / totalDetections;
            
            // Use a larger threshold for nearby notes and when we've been locked on a note for a while
            // This prevents random switching during sustained notes
            const baseThreshold = isNearbyNote ? NEARBY_NOTE_CHANGE_THRESHOLD : NOTE_CHANGE_THRESHOLD;
            
            // Increase threshold based on how long we've been tuning the current note
            // and how close we are to being in tune
            let stabilityBonus = 0;
            
            // If we're getting close to in-tune, make it harder to switch notes
            if (stableTuningCounterRef.current > STABLE_TUNING_THRESHOLD / 2) {
              stabilityBonus += 1.5;
            }
            
            // If we've been locked on this note for a while, make it harder to switch
            if (lockDuration > 1500) { // 1.5 seconds
              stabilityBonus += 1;
            }
            
            // Calculate adaptive threshold - more consistent detection = lower threshold
            const adaptiveBase = baseThreshold + stabilityBonus;
            const adaptiveThreshold = Math.max(2, Math.round(adaptiveBase * (1 - consistencyFactor * 0.4)));
            
            // If we've detected a different note consistently enough, switch to it
            if (noteChangeCounterRef.current >= adaptiveThreshold) {
              // Instead of null, use cents to set a valid tuning status during transition
              const newTuningStatus = getSmoothCents(noteInfo.cents) < -10 ? "flat" : getSmoothCents(noteInfo.cents) > 10 ? "sharp" : "in-tune"
              setTuningStatus(newTuningStatus)
              
              // Short timeout to create a visual transition before showing the new note
              setTimeout(() => {
                currentLockedNoteRef.current = detectedNote
                noteChangeCounterRef.current = 0
                lockedNoteTimeRef.current = Date.now()
                stableTuningCounterRef.current = 0
                
                // Reset counters for other notes
                Object.keys(noteDetectionCounterRef.current).forEach((note) => {
                  if (note !== detectedNote) {
                    noteDetectionCounterRef.current[note] = 0
                  }
                })
                
                // Reset frequency buffer for the new note
                initialFrequencyBufferRef.current = [];
                
                // Reset cents buffer
                centsBufferRef.current = [getSmoothCents(noteInfo.cents)]
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
    resetDisplayToDefault,
    currentNote,
    currentFrequency,
    signalDetected,
    cents,
    getSmoothCents,
    updateAdaptiveThreshold,
    isNoteLocked,
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

  // Ensure state is consistent - never show a tuning status without a note 
  useEffect(() => {
    // If we have no current note but have a tuning status, reset the tuning status
    if (currentNote === null && tuningStatus !== null) {
      setTuningStatus(null);
    }
    
    // If we have no current note but have a frequency, reset the frequency
    if (currentNote === null && (displayFrequency !== null || currentFrequency !== null)) {
      setDisplayFrequency(null);
      setCurrentFrequency(null);
    }
  }, [currentNote, tuningStatus, displayFrequency, currentFrequency]);

  // Update the refs whenever the values change
  useEffect(() => {
    useFlatsRef.current = useFlats;
  }, [useFlats]);
  
  useEffect(() => {
    referenceFreqRef.current = referenceFreq;
  }, [referenceFreq]);

  // Actions
  const toggleNotation = useCallback(() => {
    setUseFlats((prev) => !prev);
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

  // Helper function to calculate frequency stability
  const calculateFrequencyStability = (frequencies: number[]): number => {
    if (frequencies.length < 2) return 0;
    
    // Calculate standard deviation
    const mean = frequencies.reduce((sum, freq) => sum + freq, 0) / frequencies.length;
    const squareDiffs = frequencies.map(freq => Math.pow(freq - mean, 2));
    const variance = squareDiffs.reduce((sum, diff) => sum + diff, 0) / frequencies.length;
    const stdDev = Math.sqrt(variance);
    
    // Normalize to a 0-1 scale where 0 means high variation and 1 means stable
    // For frequency, even 1-2 Hz variation is considered stable
    const normalizedStability = Math.max(0, Math.min(1, 1 - (stdDev / mean) * 20));
    
    return normalizedStability;
  }

  // Helper function to calculate note pattern stability
  const calculateNotePatternStability = (noteHistory: string[]): number => {
    if (noteHistory.length < 3) return 0;
    
    // Count consecutive occurrences of the most recent note
    let consecutiveCount = 1;
    const mostRecentNote = noteHistory[noteHistory.length - 1];
    
    for (let i = noteHistory.length - 2; i >= 0; i--) {
      if (noteHistory[i] === mostRecentNote) {
        consecutiveCount++;
      } else {
        break;
      }
    }
    
    // Calculate stability as ratio of consecutive same notes
    return consecutiveCount / noteHistory.length;
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

