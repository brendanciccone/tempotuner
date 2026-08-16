"use client"

import * as React from "react"

import { useState, useEffect, useRef, useCallback } from "react"
import { Slider } from "@/components/ui/slider"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectGroup, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select"
import * as SelectPrimitive from "@radix-ui/react-select"
import { BeatIndicator } from "@/components/beat-indicator"
import { cn } from "@/lib/utils"
import { accentForBeat, beatPaintDelayMs, clickVoiceForAccent } from "@/utils/metronome-timing"

interface MetronomeProps {
  initialBpm: number
  onBpmChange: (bpm: number) => void
  onStateChange?: (isPlaying: boolean, currentBeat: number) => void
}

/**
 * Web Audio raises InvalidStateError for the routine "this node or context is
 * already in the state you are asking for" cases — stopping an oscillator that
 * was scheduled but never started, closing a context that is already closed.
 * Teardown hits both by design. Every other DOMException is a real failure and
 * must not be swallowed with them.
 */
const isAlreadyInTargetState = (err: unknown): boolean =>
  err instanceof DOMException && err.name === "InvalidStateError"

// Custom SelectItem with the selection marker on the right
const CustomSelectItem = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Item
    ref={ref}
    className={cn(
      "relative flex w-full cursor-pointer select-none items-center justify-between rounded-sm py-1.5 pl-3 pr-8 text-base uppercase tracking-body outline-none",
      "focus:bg-fill focus:text-on-fill data-[disabled]:pointer-events-none data-[disabled]:text-ink-faint",
      className,
    )}
    {...props}
  >
    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    <span className="absolute right-2 flex w-4 items-center justify-center">
      <SelectPrimitive.ItemIndicator>
        <span aria-hidden="true">◂</span>
      </SelectPrimitive.ItemIndicator>
    </span>
  </SelectPrimitive.Item>
))
CustomSelectItem.displayName = SelectPrimitive.Item.displayName

export function Metronome({ initialBpm, onBpmChange, onStateChange }: MetronomeProps) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [bpm, setBpm] = useState(initialBpm || 120)
  const [currentBeat, setCurrentBeat] = useState(0)
  const [timeSignature, setTimeSignature] = useState("4/4")
  const [beatsPerMeasure, setBeatsPerMeasure] = useState(4)
  const [isNotesExpanded, setIsNotesExpanded] = useState(false)
  const [isCompoundMeter, setIsCompoundMeter] = useState(false)
  const [displayBpm, setDisplayBpm] = useState(initialBpm || 120)

  // Refs for audio processing
  const audioContextRef = useRef<AudioContext | null>(null)
  const nextNoteTimeRef = useRef<number>(0)
  const timerIDRef = useRef<number | null>(null)
  const beatCountRef = useRef<number>(0)
  const bpmRef = useRef<number>(bpm)
  const beatsPerMeasureRef = useRef<number>(beatsPerMeasure)
  const oscillatorsRef = useRef<{ osc: OscillatorNode; gain: GainNode }[]>([])
  const isPlayingRef = useRef<boolean>(false)
  // The scheduler runs from a setTimeout chain started at toggle time, so every
  // value it reads has to come from a ref: the state it captured belongs to the
  // render that started it. Compound accents were the one that got missed —
  // switching 4/4 to 6/8 mid-run kept clicking flat until you stopped.
  const isCompoundMeterRef = useRef<boolean>(false)
  // Beat paints are queued ahead of time, so they have to be cancellable: a
  // paint left over from a stopped metronome would light a cell on a panel that
  // is no longer running.
  const beatPaintTimeoutsRef = useRef<number[]>([])

  // Declared above the unmount effect that calls it: as a `const` arrow it is
  // in the temporal dead zone until this point, so an effect defined earlier
  // would capture only the first render's binding.
  const cleanupOscillators = () => {
    oscillatorsRef.current.forEach(({ osc, gain }) => {
      try {
        osc.stop()
        osc.disconnect()
        gain.disconnect()
      } catch (err) {
        if (!isAlreadyInTargetState(err)) throw err
      }
    })
    oscillatorsRef.current = []
  }

  const cancelPendingBeatPaints = () => {
    beatPaintTimeoutsRef.current.forEach((id) => window.clearTimeout(id))
    beatPaintTimeoutsRef.current = []
  }

  // Initialize audio context
  useEffect(() => {
    return () => {
      // Clean up timer on unmount
      if (timerIDRef.current) {
        window.clearTimeout(timerIDRef.current)
      }

      cancelPendingBeatPaints()

      // Clean up oscillators
      cleanupOscillators()

      // Close audio context
      if (audioContextRef.current) {
        audioContextRef.current.close()
      }
    }
  }, [])

  // Update BPM when initialBpm changes
  useEffect(() => {
    if (initialBpm && initialBpm > 0) {
      // Store the actual BPM for display and delay calculator
      setDisplayBpm(initialBpm)
      
      // For the metronome functionality, limit to valid range
      const metronomeValidBpm = Math.min(Math.max(40, initialBpm), 240)
      setBpm(metronomeValidBpm)
      bpmRef.current = metronomeValidBpm
    }
  }, [initialBpm])

  // Handle time signature change
  useEffect(() => {
    // Parse the time signature to get beats per measure
    const [numerator, denominator] = timeSignature.split("/").map(Number)
    setBeatsPerMeasure(numerator)
    beatsPerMeasureRef.current = numerator

    // Detect compound meters (6/8, 9/8, 12/8, etc.)
    const compound = (numerator === 6 || numerator === 9 || numerator === 12) && denominator === 8
    setIsCompoundMeter(compound)
    isCompoundMeterRef.current = compound

    // Reset beat counter ONLY when time signature changes and metronome is playing
    if (isPlaying) {
      cancelPendingBeatPaints()
      beatCountRef.current = 0;
      setCurrentBeat(0);
    }
  }, [timeSignature, isPlaying])

  // Update BPM ref when BPM changes
  useEffect(() => {
    // For metronome functionality, ensure we use a BPM within valid range (40-240)
    bpmRef.current = Math.min(Math.max(40, bpm), 240)
  }, [bpm])

  // Update isPlayingRef when isPlaying changes
  useEffect(() => {
    isPlayingRef.current = isPlaying
  }, [isPlaying])

  // Notify parent component of state changes
  useEffect(() => {
    if (onStateChange) {
      // Only report a beat while running; a stopped metronome reports the
      // downbeat so parents do not hold a stale beat lit.
      onStateChange(isPlaying, isPlaying ? currentBeat : 0);
    }
  }, [isPlaying, currentBeat, onStateChange]);

  // Initialize audio context if needed
  const ensureAudioContext = () => {
    try {
      // Check if we have an existing context that's suspended
      if (audioContextRef.current && audioContextRef.current.state === "suspended") {
        // Try to resume it
        audioContextRef.current.resume();
        return true;
      }

      // If we don't have a context or if there's an issue with the existing one, create a new one
      if (!audioContextRef.current) {
        // Use the modern standardized API with fallback for older browsers
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;

        if (!AudioContextClass) {
          console.error("AudioContext is not supported in this browser");
          return false;
        }
        
        // Create a fresh audio context
        audioContextRef.current = new AudioContextClass({
          // Request low latency mode if available
          latencyHint: 'interactive'
        });
        
        // Force resume the context if suspended (some browsers require user interaction)
        if (audioContextRef.current.state === "suspended") {
          audioContextRef.current.resume();
        }
      }
      
      return true;
    } catch (e) {
      console.error("Error initializing AudioContext:", e);
      return false;
    }
  }

  // Play a metronome click with nicer waveforms
  const playClick = (time: number) => {
    const audioContext = audioContextRef.current;
    if (!audioContext || !isPlayingRef.current) return;

    // Ensure we have a valid time parameter
    if (isNaN(time)) {
      console.error("Invalid time parameter in playClick:", time);
      return;
    }

    // Get current beat count before incrementing
    const currentBeatInMeasure = beatCountRef.current;

    // One accent map, shared with the beat indicator, so what the panel shows
    // and what the speaker plays cannot disagree.
    const voice = clickVoiceForAccent(
      accentForBeat(currentBeatInMeasure, isCompoundMeterRef.current),
    );

    // Create oscillator directly
    const osc = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    // Configure sound
    osc.type = voice.type;
    osc.frequency.value = voice.frequency;

    // Set envelope
    gainNode.gain.value = 0;
    gainNode.gain.setValueAtTime(0, time);
    gainNode.gain.linearRampToValueAtTime(voice.gain, time + 0.005);
    gainNode.gain.linearRampToValueAtTime(0.0001, time + 0.1);

    // Connect and play
    osc.connect(gainNode);
    gainNode.connect(audioContext.destination);

    // Start and schedule stop
    osc.start(time);
    osc.stop(time + 0.1);

    // Track for cleanup
    oscillatorsRef.current.push({ osc, gain: gainNode });

    // Cleanup when done
    setTimeout(() => {
      // No try/catch: findIndex and splice on a plain array cannot throw, so
      // one here could only have hidden a future unrelated failure.
      const index = oscillatorsRef.current.findIndex(item => item.osc === osc);
      if (index !== -1) {
        oscillatorsRef.current.splice(index, 1);
      }
    }, Math.max(0, (time + 0.15 - audioContext.currentTime) * 1000));

    // Light the beat when it SOUNDS, not when it is scheduled. The scheduler
    // runs 100ms ahead of the clock, so painting here would put the display
    // ahead of the click by up to 40% of a beat at 240 BPM.
    const paintId = window.setTimeout(() => {
      beatPaintTimeoutsRef.current = beatPaintTimeoutsRef.current.filter((id) => id !== paintId);
      if (isPlayingRef.current) {
        setCurrentBeat(currentBeatInMeasure);
      }
    }, beatPaintDelayMs(time, audioContext.currentTime));
    beatPaintTimeoutsRef.current.push(paintId);

    // Update beat count AFTER scheduling the sound
    beatCountRef.current = (currentBeatInMeasure + 1) % beatsPerMeasureRef.current;
  };

  // Schedule upcoming metronome clicks with improved timing and cleanup
  const scheduler = () => {
    if (!audioContextRef.current || !isPlayingRef.current) return

    // Calculate time values
    const currentTime = audioContextRef.current.currentTime

    // Calculate seconds per beat based on current BPM
    const secondsPerBeat = 60.0 / bpmRef.current

    // Schedule notes until the next 100ms
    while (nextNoteTimeRef.current < currentTime + 0.1) {
      // Schedule this beat
      playClick(nextNoteTimeRef.current)

      // Advance time for next beat
      nextNoteTimeRef.current += secondsPerBeat
    }

    // Schedule the next scheduler call - use a shorter interval for better accuracy
    timerIDRef.current = window.setTimeout(scheduler, 15)
  }

  // Create sound to use for click sounds
  const createSoundSamples = useCallback(() => {
    if (!audioContextRef.current) return;
    
    // Create test oscillators to ensure they're allowed
    const testOsc = audioContextRef.current.createOscillator();
    testOsc.type = "sine";
    testOsc.frequency.value = 440;
    
    const testGain = audioContextRef.current.createGain();
    testGain.gain.value = 0;
    
    testOsc.connect(testGain);
    testGain.connect(audioContextRef.current.destination);
    
    // Start and immediately stop to "prime" the audio engine
    testOsc.start(audioContextRef.current.currentTime);
    testOsc.stop(audioContextRef.current.currentTime + 0.001);
  }, []);

  // Toggle metronome on/off with improved state management and cleanup
  const toggleMetronome = () => {
    if (!ensureAudioContext()) return;

    // Ensure audio context is running
    if (audioContextRef.current && audioContextRef.current.state !== "running") {
      audioContextRef.current.resume().catch(err => {
        console.error("Failed to resume audio context:", err);
      });
    }

    if (isPlaying) {
      // Stop metronome
      if (timerIDRef.current) {
        window.clearTimeout(timerIDRef.current);
        timerIDRef.current = null;
      }

      cancelPendingBeatPaints();

      // Clean up oscillators
      cleanupOscillators();

      // Reset state
      setIsPlaying(false);
      isPlayingRef.current = false;
      beatCountRef.current = 0;
      setCurrentBeat(0);
    } else {
      // Create fresh audio context to avoid issues
      try {
        if (audioContextRef.current) {
          try {
            // close() rejects asynchronously as well as throwing synchronously.
            // This context is discarded on the next line either way, so an
            // unexpected close failure has nothing left to recover — but it
            // still gets reported rather than dropped, because it means the old
            // context is leaking rather than closing.
            audioContextRef.current.close().catch((err: unknown) => {
              if (!isAlreadyInTargetState(err)) {
                console.error("Failed to close the previous AudioContext:", err);
              }
            });
          } catch (err) {
            // The enclosing catch logs and falls back to ensureAudioContext().
            if (!isAlreadyInTargetState(err)) throw err;
          }
          audioContextRef.current = null;
        }
        
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        // The surrounding catch falls back to ensureAudioContext(); an explicit
        // throw gets there with a diagnosable message instead of a TypeError
        // from calling `new` on undefined.
        if (!AudioContextClass) {
          throw new Error("Web Audio API is not supported in this browser");
        }
        audioContextRef.current = new AudioContextClass({ latencyHint: 'interactive' });
        
        createSoundSamples();
      } catch (e) {
        console.error("Failed to create AudioContext:", e);
        ensureAudioContext();
      }
      
      // Initialize state for starting
      beatCountRef.current = 0;
      setCurrentBeat(0);
      nextNoteTimeRef.current = audioContextRef.current!.currentTime + 0.1;
      
      // Set playing states
      setIsPlaying(true);
      isPlayingRef.current = true;
      
      // Clean scheduler
      if (timerIDRef.current) {
        window.clearTimeout(timerIDRef.current);
        timerIDRef.current = null;
      }
      
      // Start scheduling
      scheduler();
    }
  };

  // Handle BPM change from slider
  const handleBpmChange = (value: number[]) => {
    const newBpm = value[0]
    setDisplayBpm(newBpm)
    setBpm(newBpm)
    bpmRef.current = newBpm
    onBpmChange(newBpm)
  }

  // Increment/decrement BPM
  const adjustBpm = (amount: number) => {
    const newBpm = Math.min(Math.max(40, bpm + amount), 240)
    setDisplayBpm(newBpm)
    setBpm(newBpm)
    bpmRef.current = newBpm
    onBpmChange(newBpm)
  }

  const handleNotesToggle = () => {
    setIsNotesExpanded((expanded) => !expanded)
  }

  // Calculate note durations based on current BPM
  const calculateNoteDurations = () => {
    // Base duration for a quarter note in milliseconds
    // Use displayBpm which could be from tap tempo and might exceed 240
    const quarterNote = Math.round(60000 / displayBpm)

    return [
      { name: "Whole note", symbol: "𝅝", duration: quarterNote * 4 },
      { name: "Dotted half", symbol: "𝅗𝅥.", duration: Math.round(quarterNote * 3) },
      { name: "Half note", symbol: "𝅗𝅥", duration: quarterNote * 2 },
      { name: "Dotted quarter", symbol: "♩.", duration: Math.round(quarterNote * 1.5) },
      { name: "Quarter note", symbol: "♩", duration: quarterNote },
      { name: "Dotted eighth", symbol: "♪.", duration: Math.round(quarterNote * 0.75) },
      { name: "Eighth note", symbol: "♪", duration: Math.round(quarterNote / 2) },
      { name: "Triplet quarter", symbol: "♩𝅭", duration: Math.round((quarterNote * 2) / 3) },
      { name: "Sixteenth note", symbol: "𝅘𝅥𝅯", duration: Math.round(quarterNote / 4) },
      { name: "Triplet eighth", symbol: "♪𝅭", duration: Math.round(quarterNote / 3) },
      { name: "32nd note", symbol: "𝅘𝅥𝅰", duration: Math.round(quarterNote / 8) },
    ]
  }

  const noteDurations = calculateNoteDurations()

  return (
    <div className="w-full">
      <div className="relative rounded-lg border-2 border-stroke px-4 pt-6 pb-4">
        {/* Legend chip breaking the top rule — the panel names itself. */}
        <div className="absolute -top-[10px] left-3 px-2 bg-screen-raised text-sm uppercase tracking-display text-ink text-glow leading-none">
          Metronome
        </div>
        <div className="flex flex-col gap-4">
          {/* Top Row - Metronome On/Off Button and Time Signature */}
          <div className="flex items-center justify-between gap-3">
            <Button
              onClick={toggleMetronome}
              variant={isPlaying ? "default" : "outline"}
              aria-pressed={isPlaying}
              className="flex-1"
            >
              {/* The state word is mandatory: on a monochrome panel a lit
                  surface alone is ambiguous. */}
              <span aria-hidden="true">{isPlaying ? "▶" : "■"}</span>
              <span>{isPlaying ? "Running" : "Stopped"}</span>
              <span className="sr-only">{isPlaying ? "Turn off" : "Turn on"} metronome</span>
            </Button>

            <Select value={timeSignature} onValueChange={setTimeSignature}>
              <SelectTrigger className="w-24 shrink-0" aria-label="Time signature">
                <SelectValue placeholder="4/4" />
              </SelectTrigger>
              <SelectContent className="min-w-[140px]">
                <SelectGroup>
                  <SelectLabel>Common</SelectLabel>
                  <CustomSelectItem value="2/4">2/4</CustomSelectItem>
                  <CustomSelectItem value="3/4">3/4</CustomSelectItem>
                  <CustomSelectItem value="4/4">4/4</CustomSelectItem>
                </SelectGroup>
                <SelectGroup>
                  <SelectLabel>Compound</SelectLabel>
                  <CustomSelectItem value="6/8">6/8</CustomSelectItem>
                  <CustomSelectItem value="9/8">9/8</CustomSelectItem>
                  <CustomSelectItem value="12/8">12/8</CustomSelectItem>
                </SelectGroup>
                <SelectGroup>
                  <SelectLabel>Other</SelectLabel>
                  <CustomSelectItem value="5/4">5/4</CustomSelectItem>
                  <CustomSelectItem value="7/8">7/8</CustomSelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          {/* Bottom Row - BPM Slider with aligned buttons */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => adjustBpm(-1)}
              className="shrink-0 rounded-sm"
            >
              <span aria-hidden="true">−</span>
              <span className="sr-only">Decrease tempo</span>
            </Button>

            <div className="flex-1 flex items-center">
              <Slider
                value={[bpm]}
                min={40}
                max={240}
                step={1}
                onValueChange={handleBpmChange}
                aria-label="Tempo in beats per minute"
              />
            </div>

            <Button
              variant="outline"
              size="icon"
              onClick={() => adjustBpm(1)}
              className="shrink-0 rounded-sm"
            >
              <span aria-hidden="true">+</span>
              <span className="sr-only">Increase tempo</span>
            </Button>
          </div>

          {/* The scale under the bargraph, in the micro face. */}
          <div className="flex justify-between font-micro text-micro tracking-micro text-ink-faint -mt-2">
            <span>40</span>
            <span>{bpm} BPM</span>
            <span>240</span>
          </div>

          {/* The measure, one cell per beat. Useful with the volume down and
              the only way to see where the accents fall in an odd meter. */}
          <BeatIndicator
            beatsPerMeasure={beatsPerMeasure}
            currentBeat={currentBeat}
            isPlaying={isPlaying}
            isCompoundMeter={isCompoundMeter}
          />
        </div>
      </div>

      {/* Note Calculations Section as an expandable region */}
      <div className="mt-4 overflow-hidden rounded-lg border-2 border-stroke-dim">
        {/* The heading wraps the trigger rather than sitting inside it: <button>
            only accepts phrasing content, so a nested <h3> is invalid markup and
            loses its heading semantics in the a11y tree. aria-expanded already
            announces open/closed, so the old sr-only duplicate is gone — it only
            padded the button's accessible name. */}
        <h3>
          <button
            type="button"
            onClick={handleNotesToggle}
            aria-expanded={isNotesExpanded}
            aria-controls="delay-reverb-table"
            className="flex w-full cursor-pointer items-center justify-between gap-2 px-4 py-3 text-left text-base uppercase tracking-body text-ink hover:text-ink-bright focus:outline-none focus-visible:outline-2 focus-visible:outline-dashed focus-visible:outline-ink-dim focus-visible:-outline-offset-[3px]"
          >
            <span>Delay & Reverb Calculator</span>
            <span aria-hidden="true">{isNotesExpanded ? "▲" : "▼"}</span>
          </button>
        </h3>

        <div id="delay-reverb-table" hidden={!isNotesExpanded}>
          <div className="px-4 pb-4">
            <table className="w-full border-collapse">
              <thead>
                {/* Inverse video: the header is the machine labelling its own
                    output. */}
                <tr>
                  <th className="bg-fill text-on-fill text-left text-sm uppercase tracking-body px-2 py-1 w-1/2">
                    Note
                  </th>
                  <th className="bg-fill text-on-fill text-left text-sm uppercase tracking-body px-2 py-1 w-1/2">
                    Duration
                  </th>
                </tr>
              </thead>
              <tbody>
                {noteDurations.map((note, index) => (
                  <tr key={index} className="border-b-2 border-stroke-dim">
                    <td className="px-2 py-1 text-sm uppercase tracking-body">{note.name}</td>
                    <td className="px-2 py-1 text-sm tabular-nums text-ink-bright">
                      {note.duration} ms
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-4 text-sm uppercase tracking-body text-ink-dim">
              Delay and reverb times are calculated from the current tempo ({displayBpm} BPM). A quarter note at this tempo
              equals {Math.round(60000 / displayBpm)} milliseconds.
              {displayBpm > 240 && " Metronome playback is limited to 240 BPM, but delay calculations remain accurate at any tempo."}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

