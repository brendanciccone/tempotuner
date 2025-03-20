"use client"

import * as React from "react"

import { useState, useEffect, useRef } from "react"
import { Slider } from "@/components/ui/slider"
import { Button } from "@/components/ui/button"
import { Volume2, VolumeX, Minus, Plus, ChevronDown, ChevronUp, Check } from "lucide-react"
import { Select, SelectContent, SelectGroup, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select"
import * as SelectPrimitive from "@radix-ui/react-select"
import { cn } from "@/lib/utils"

interface MetronomeProps {
  initialBpm: number
  onBpmChange: (bpm: number) => void
  onStateChange?: (isPlaying: boolean, currentBeat: number) => void
}

// Custom SelectItem with checkmark on the right
const CustomSelectItem = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Item
    ref={ref}
    className={cn(
      "relative flex w-full cursor-default select-none items-center justify-between rounded-sm py-1.5 px-3 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
      className,
    )}
    {...props}
  >
    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    <span className="absolute right-2 flex h-3.5 w-3.5 items-center justify-center">
      <SelectPrimitive.ItemIndicator>
        <Check className="h-4 w-4" />
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

  // Initialize audio context
  useEffect(() => {
    return () => {
      // Clean up timer on unmount
      if (timerIDRef.current) {
        window.clearTimeout(timerIDRef.current)
      }

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
    setIsCompoundMeter((numerator === 6 || numerator === 9 || numerator === 12) && denominator === 8)

    // Reset beat counter when time signature changes
    beatCountRef.current = 0
    setCurrentBeat(0)

    if (onStateChange) {
      onStateChange(isPlaying, 0)
    }
  }, [timeSignature, isPlaying, onStateChange])

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
      onStateChange(isPlaying, currentBeat)
    }
  }, [isPlaying, currentBeat, onStateChange])

  // Clean up oscillators
  const cleanupOscillators = () => {
    oscillatorsRef.current.forEach(({ osc, gain }) => {
      try {
        osc.stop()
        osc.disconnect()
        gain.disconnect()
      } catch (e) {
        // Ignore errors from already stopped oscillators
      }
    })
    oscillatorsRef.current = []
  }

  // Initialize audio context if needed
  const ensureAudioContext = () => {
    if (!audioContextRef.current) {
      try {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)()
      } catch (e) {
        console.error("Web Audio API is not supported in this browser", e)
        return false
      }
    } else if (audioContextRef.current.state === "suspended") {
      audioContextRef.current.resume()
    }
    return true
  }

  // Play a metronome click with nicer waveforms
  const playClick = (time: number) => {
    if (!audioContextRef.current || !isPlayingRef.current) return

    // Create oscillator
    const osc = audioContextRef.current.createOscillator()
    const gainNode = audioContextRef.current.createGain()

    // Determine beat type for sound selection
    let beatType: "primary" | "secondary" | "regular" = "regular"

    if (beatCountRef.current === 0) {
      // First beat of the measure (downbeat)
      beatType = "primary"
    } else if (isCompoundMeter && beatCountRef.current % 3 === 0) {
      // For compound meters (6/8, 9/8, 12/8), add secondary accent on beats 4, 7, 10
      beatType = "secondary"
    }

    // Set up different sounds based on beat type with nicer waveforms
    switch (beatType) {
      case "primary":
        // First beat - use a sine wave with higher pitch and volume
        osc.type = "sine"
        osc.frequency.value = 880 // A5 - higher pitch for first beat
        gainNode.gain.value = 0.0
        gainNode.gain.linearRampToValueAtTime(0.4, time) // Louder
        break

      case "secondary":
        // Secondary accent - use a sine wave with medium pitch
        osc.type = "sine"
        osc.frequency.value = 659.25 // E5 - medium pitch
        gainNode.gain.value = 0.0
        gainNode.gain.linearRampToValueAtTime(0.25, time) // Medium volume
        break

      default:
        // Regular beats - use a sine wave with lower pitch
        osc.type = "sine"
        osc.frequency.value = 440 // A4 - lower pitch
        gainNode.gain.value = 0.0
        gainNode.gain.linearRampToValueAtTime(0.15, time) // Quieter
    }

    // Connect nodes
    osc.connect(gainNode)
    gainNode.connect(audioContextRef.current.destination)

    // Set volume envelope with smoother ramp
    gainNode.gain.linearRampToValueAtTime(0.001, time + 0.1)

    // Track oscillators for cleanup
    oscillatorsRef.current.push({ osc, gain: gainNode })

    // Play sound at the precise scheduled time
    osc.start(time)
    osc.stop(time + 0.1)

    // Set up cleanup after the sound is done
    setTimeout(
      () => {
        const index = oscillatorsRef.current.findIndex((item) => item.osc === osc)
        if (index !== -1) {
          oscillatorsRef.current.splice(index, 1)
        }
      },
      (time + 0.2 - audioContextRef.current.currentTime) * 1000,
    )

    // Update beat count
    beatCountRef.current = (beatCountRef.current + 1) % beatsPerMeasureRef.current

    // Update UI on next animation frame to avoid blocking audio thread
    requestAnimationFrame(() => {
      if (isPlayingRef.current) {
        setCurrentBeat(beatCountRef.current)
      }
    })
  }

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

    // Schedule the next scheduler call
    timerIDRef.current = window.setTimeout(scheduler, 25)
  }

  // Toggle metronome on/off with improved state management and cleanup
  const toggleMetronome = () => {
    if (!ensureAudioContext()) return

    if (isPlaying) {
      // Stop metronome
      if (timerIDRef.current) {
        window.clearTimeout(timerIDRef.current)
        timerIDRef.current = null
      }

      // Clean up any playing oscillators
      cleanupOscillators()

      setIsPlaying(false)
      isPlayingRef.current = false
      beatCountRef.current = 0
      setCurrentBeat(0)
    } else {
      // Start metronome
      // Reset beat counter
      beatCountRef.current = 0
      setCurrentBeat(0)

      // Clean up any lingering oscillators before starting
      cleanupOscillators()

      // Start scheduling
      nextNoteTimeRef.current = audioContextRef.current!.currentTime + 0.05 // Small delay before first beat
      setIsPlaying(true)
      isPlayingRef.current = true
      scheduler()
    }
  }

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
      <div className="bg-background/10 backdrop-blur-sm rounded-xl p-4 border border-border shadow-sm">
        <div className="flex flex-col gap-4">
          {/* Top Row - Metronome On/Off Button and Time Signature */}
          <div className="flex items-center justify-between gap-3">
            <Button
              onClick={toggleMetronome}
              variant={isPlaying ? "default" : "outline"}
              className={`h-10 flex-1 transition-all duration-200 ${
                isPlaying
                  ? "bg-primary hover:bg-primary/90"
                  : "border-input hover:bg-accent hover:text-accent-foreground"
              }`}
            >
              {isPlaying ? (
                <>
                  <Volume2 className="h-4 w-4 mr-2" />
                  <span>Metronome</span>
                </>
              ) : (
                <>
                  <VolumeX className="h-4 w-4 mr-2" />
                  <span>Metronome</span>
                </>
              )}
              <span className="sr-only">{isPlaying ? "Turn off" : "Turn on"} metronome</span>
            </Button>

            <Select value={timeSignature} onValueChange={setTimeSignature}>
              <SelectTrigger className="w-20 h-10 bg-background/50 border-input text-center">
                <SelectValue placeholder="4/4" className="text-center" />
              </SelectTrigger>
              <SelectContent className="min-w-[120px]">
                <SelectGroup>
                  <SelectLabel className="px-3 py-1 text-xs font-semibold text-muted-foreground">Common</SelectLabel>
                  <CustomSelectItem value="2/4">2/4</CustomSelectItem>
                  <CustomSelectItem value="3/4">3/4</CustomSelectItem>
                  <CustomSelectItem value="4/4">4/4</CustomSelectItem>
                  <CustomSelectItem value="2/2">2/2 (Cut)</CustomSelectItem>
                </SelectGroup>
                <SelectGroup>
                  <SelectLabel className="px-3 py-1 text-xs font-semibold text-muted-foreground">Compound</SelectLabel>
                  <CustomSelectItem value="6/8">6/8</CustomSelectItem>
                  <CustomSelectItem value="9/8">9/8</CustomSelectItem>
                  <CustomSelectItem value="12/8">12/8</CustomSelectItem>
                </SelectGroup>
                <SelectGroup>
                  <SelectLabel className="px-3 py-1 text-xs font-semibold text-muted-foreground">
                    Odd Meters
                  </SelectLabel>
                  <CustomSelectItem value="5/4">5/4</CustomSelectItem>
                  <CustomSelectItem value="7/4">7/4</CustomSelectItem>
                  <CustomSelectItem value="5/8">5/8</CustomSelectItem>
                  <CustomSelectItem value="7/8">7/8</CustomSelectItem>
                </SelectGroup>
                <SelectGroup>
                  <SelectLabel className="px-3 py-1 text-xs font-semibold text-muted-foreground">Other</SelectLabel>
                  <CustomSelectItem value="3/2">3/2</CustomSelectItem>
                  <CustomSelectItem value="3/8">3/8</CustomSelectItem>
                  <CustomSelectItem value="6/4">6/4</CustomSelectItem>
                  <CustomSelectItem value="9/4">9/4</CustomSelectItem>
                  <CustomSelectItem value="11/8">11/8</CustomSelectItem>
                  <CustomSelectItem value="15/8">15/8</CustomSelectItem>
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
              className="h-10 w-10 rounded-md flex-shrink-0 border border-input bg-background"
            >
              <Minus className="h-4 w-4" />
              <span className="sr-only">Decrease tempo</span>
            </Button>

            <div className="flex-1 flex items-center">
              <Slider
                value={[bpm]}
                min={40}
                max={240}
                step={1}
                onValueChange={handleBpmChange}
                className="cursor-pointer"
              />
            </div>

            <Button
              variant="outline"
              size="icon"
              onClick={() => adjustBpm(1)}
              className="h-10 w-10 rounded-md flex-shrink-0 border border-input bg-background"
            >
              <Plus className="h-4 w-4" />
              <span className="sr-only">Increase tempo</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Note Calculations Section as an FAQ-style expandable card */}
      <div className="mt-4 overflow-hidden rounded-lg border border-input bg-card shadow-sm">
        <div
          onClick={() => setIsNotesExpanded(!isNotesExpanded)}
          className="flex cursor-pointer items-center justify-between px-4 py-3 bg-background hover:bg-accent/50 transition-colors"
        >
          <h3 className="text-sm font-medium">Delay & Reverb Calculator</h3>
          <button
            type="button"
            className="ml-2 h-5 w-5 rounded-full flex items-center justify-center text-muted-foreground"
            aria-expanded={isNotesExpanded}
          >
            {isNotesExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            <span className="sr-only">{isNotesExpanded ? "Close" : "Open"} delay & reverb calculator</span>
          </button>
        </div>

        <div
          className={`overflow-hidden transition-all duration-300 ease-in-out ${
            isNotesExpanded ? "max-h-[500px] opacity-100" : "max-h-0 opacity-0"
          }`}
        >
          <div className="p-4 bg-background">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className="text-left text-xs uppercase tracking-wider font-medium text-muted-foreground pb-2 w-1/2">
                    Note
                  </th>
                  <th className="text-left text-xs uppercase tracking-wider font-medium text-muted-foreground pb-2 w-1/2">
                    Duration
                  </th>
                </tr>
              </thead>
              <tbody>
                {noteDurations.map((note, index) => (
                  <tr key={index} className="border-t border-border first:border-0">
                    <td className="py-2">{note.name}</td>
                    <td className="py-2 tabular-nums">{note.duration} ms</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-4 text-xs text-muted-foreground">
              Delay and reverb times are calculated based on the current tempo ({displayBpm} BPM). A quarter note at this tempo
              equals {Math.round(60000 / displayBpm)} milliseconds.
              {displayBpm > 240 && " Metronome playback is limited to 240 BPM, but delay calculations remain accurate at any tempo."}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

