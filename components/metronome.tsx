"use client"

import * as React from "react"

import { useState, useEffect, useRef } from "react"
import { Slider } from "@/components/ui/slider"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectGroup, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select"
import * as SelectPrimitive from "@radix-ui/react-select"
import { BeatIndicator } from "@/components/beat-indicator"
import { cn } from "@/lib/utils"
import {
  accentForBeat,
  beatPaintDelayMs,
  clampMetronomeBpm,
  clickVoiceForAccent,
  MAX_METRONOME_BPM,
  MIN_METRONOME_BPM,
  parseTimeSignature,
} from "@/utils/metronome-timing"

interface MetronomeProps {
  /** The tempo on the panel. Can sit outside the playable range (tap tempo). */
  bpm: number
  onBpmChange: (bpm: number) => void
  onStateChange?: (isPlaying: boolean, currentBeat: number) => void
}

/**
 * No beat is sounding. The first click of a run is scheduled 100ms out, so
 * between pressing start and that click there is genuinely nothing to light —
 * reporting beat 0 there lit the downbeat cell ahead of its own click, which is
 * the exact lead the scheduled paint below exists to remove.
 */
const NO_BEAT = -1

/** Delay from pressing start to the first click, in seconds. */
const START_DELAY_S = 0.1

/**
 * How far ahead of the AudioContext clock clicks are scheduled, in seconds.
 * In the foreground 100ms keeps tempo changes feeling immediate. A hidden tab
 * can have its timers throttled to about once a second, which would leave
 * holes in a 100ms queue, so while hidden the queue is deep enough to bridge
 * the gap. Clicks are sample-accurate either way; only how far ahead of time
 * they are committed changes.
 */
const SCHEDULE_AHEAD_S = 0.1
const HIDDEN_SCHEDULE_AHEAD_S = 1.5
const SCHEDULER_INTERVAL_MS = 15

const AUDIO_UNAVAILABLE_MESSAGE = "Audio output is not available in this browser."
const AUDIO_START_FAILED_MESSAGE = "Couldn't start audio. Tap the metronome again to retry."

/**
 * Web Audio raises InvalidStateError for the routine "this node or context is
 * already in the state you are asking for" cases — stopping an oscillator that
 * was scheduled but never started, closing a context that is already closed.
 * Teardown hits both by design. Every other DOMException is a real failure and
 * must not be swallowed with them.
 */
const isAlreadyInTargetState = (err: unknown): boolean =>
  err instanceof DOMException && err.name === "InvalidStateError"

// Audio Session API (Safari 16.4+), not yet in TypeScript's DOM typings.
// https://developer.mozilla.org/docs/Web/API/AudioSession
type AudioSessionType = "auto" | "playback" | "transient" | "transient-solo" | "ambient" | "play-and-record"
declare global {
  interface Navigator {
    audioSession?: { type: AudioSessionType }
  }
}

/**
 * Safari maps Web Audio to the system's "ambient" category, which the iPhone's
 * ring/silent switch mutes — so with the phone on silent the metronome ran
 * with no sound at all. Declaring "playback" while it runs is how a page tells
 * WebKit this is media rather than an incidental sound effect. Like any media
 * app, that pauses other audio on the device while the click is running; the
 * session goes back to "auto" on stop. Other browsers lack the API and are
 * unaffected.
 */
const setAudioSessionType = (type: AudioSessionType): void => {
  if (typeof navigator === "undefined" || !navigator.audioSession) return
  navigator.audioSession.type = type
}

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

const DEFAULT_TIME_SIGNATURE = "4/4"

export function Metronome({ bpm: displayBpm, onBpmChange, onStateChange }: MetronomeProps) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentBeat, setCurrentBeat] = useState(NO_BEAT)
  const [timeSignature, setTimeSignature] = useState(DEFAULT_TIME_SIGNATURE)
  const [isNotesExpanded, setIsNotesExpanded] = useState(false)
  const [audioError, setAudioError] = useState<string | null>(null)

  // Derived, not stored: tap tempo can report any BPM, the click plays the
  // nearest one in range, and the delay table below keeps the exact reading.
  const bpm = clampMetronomeBpm(displayBpm)
  const { beatsPerMeasure, isCompoundMeter } = parseTimeSignature(timeSignature)

  // Refs for audio processing. One AudioContext for the component's lifetime:
  // it is created on the first start (inside the click, where browsers allow
  // audio to begin), suspended on stop and resumed on the next start.
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
  const isCompoundMeterRef = useRef<boolean>(isCompoundMeter)
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

  const cancelScheduler = () => {
    if (timerIDRef.current !== null) {
      window.clearTimeout(timerIDRef.current)
      timerIDRef.current = null
    }
  }

  useEffect(() => {
    return () => {
      cancelScheduler()
      cancelPendingBeatPaints()
      cleanupOscillators()
      if (isPlayingRef.current) setAudioSessionType("auto")

      const context = audioContextRef.current
      audioContextRef.current = null
      // close() rejects asynchronously; an already-closed context is the
      // expected case, anything else means the context is leaking.
      context?.close().catch((err: unknown) => {
        if (!isAlreadyInTargetState(err)) {
          console.error("Failed to close the metronome AudioContext:", err)
        }
      })
    }
  }, [])

  // The tempo arrives as a prop, so the running scheduler picks it up through
  // its ref on the next pass rather than from the render that started it.
  useEffect(() => {
    bpmRef.current = bpm
  }, [bpm])

  // Notify parent component of state changes
  useEffect(() => {
    if (onStateChange) {
      // Only report a beat while running; a stopped metronome reports NO_BEAT
      // so parents do not hold a stale beat lit.
      onStateChange(isPlaying, isPlaying ? currentBeat : NO_BEAT)
    }
  }, [isPlaying, currentBeat, onStateChange])

  const getOrCreateAudioContext = (): AudioContext | null => {
    if (audioContextRef.current) return audioContextRef.current

    const AudioContextClass = window.AudioContext || window.webkitAudioContext
    if (!AudioContextClass) return null

    // Throws when the platform cannot open an output device; the caller
    // reports that to the user.
    audioContextRef.current = new AudioContextClass({ latencyHint: "interactive" })
    return audioContextRef.current
  }

  // Play a metronome click with nicer waveforms
  const playClick = (audioContext: AudioContext, time: number) => {
    // Get current beat count before incrementing
    const currentBeatInMeasure = beatCountRef.current

    // One accent map, shared with the beat indicator, so what the panel shows
    // and what the speaker plays cannot disagree.
    const voice = clickVoiceForAccent(
      accentForBeat(currentBeatInMeasure, isCompoundMeterRef.current),
    )

    const osc = audioContext.createOscillator()
    const gainNode = audioContext.createGain()

    osc.type = voice.type
    osc.frequency.value = voice.frequency

    // Set envelope
    gainNode.gain.value = 0
    gainNode.gain.setValueAtTime(0, time)
    gainNode.gain.linearRampToValueAtTime(voice.gain, time + 0.005)
    gainNode.gain.linearRampToValueAtTime(0.0001, time + 0.1)

    osc.connect(gainNode)
    gainNode.connect(audioContext.destination)

    osc.start(time)
    osc.stop(time + 0.1)

    // Tracked so a stop can silence clicks that are scheduled but not yet
    // played; released once this one has finished.
    const entry = { osc, gain: gainNode }
    oscillatorsRef.current.push(entry)
    osc.onended = () => {
      oscillatorsRef.current = oscillatorsRef.current.filter((item) => item !== entry)
      gainNode.disconnect()
    }

    // Light the beat when it SOUNDS, not when it is scheduled. The scheduler
    // runs ahead of the clock, so painting here would put the display ahead of
    // the click by up to 40% of a beat at 240 BPM.
    const paintId = window.setTimeout(() => {
      beatPaintTimeoutsRef.current = beatPaintTimeoutsRef.current.filter((id) => id !== paintId)
      if (isPlayingRef.current) {
        setCurrentBeat(currentBeatInMeasure)
      }
    }, beatPaintDelayMs(time, audioContext.currentTime))
    beatPaintTimeoutsRef.current.push(paintId)

    // Update beat count AFTER scheduling the sound
    beatCountRef.current = (currentBeatInMeasure + 1) % beatsPerMeasureRef.current
  }

  // Schedule every click that falls inside the lookahead window, then re-arm.
  const scheduler = () => {
    const audioContext = audioContextRef.current
    if (!audioContext || !isPlayingRef.current) return

    const scheduleAhead = document.hidden ? HIDDEN_SCHEDULE_AHEAD_S : SCHEDULE_AHEAD_S
    const horizon = audioContext.currentTime + scheduleAhead
    const secondsPerBeat = 60.0 / bpmRef.current

    while (nextNoteTimeRef.current < horizon) {
      playClick(audioContext, nextNoteTimeRef.current)
      nextNoteTimeRef.current += secondsPerBeat
    }

    timerIDRef.current = window.setTimeout(scheduler, SCHEDULER_INTERVAL_MS)
  }

  const stopMetronome = () => {
    cancelScheduler()
    cancelPendingBeatPaints()
    cleanupOscillators()

    setIsPlaying(false)
    isPlayingRef.current = false
    beatCountRef.current = 0
    setCurrentBeat(NO_BEAT)
    setAudioSessionType("auto")

    // A running context keeps the audio device open and rendering silence,
    // which costs battery on a phone; park it until the next start.
    audioContextRef.current?.suspend().catch((err: unknown) => {
      if (!isAlreadyInTargetState(err)) {
        console.error("Failed to suspend the metronome AudioContext:", err)
      }
    })
  }

  const startMetronome = () => {
    let audioContext: AudioContext | null
    try {
      audioContext = getOrCreateAudioContext()
    } catch (err) {
      console.error("Failed to create the metronome AudioContext:", err)
      setAudioError(AUDIO_UNAVAILABLE_MESSAGE)
      return
    }
    if (!audioContext) {
      setAudioError(AUDIO_UNAVAILABLE_MESSAGE)
      return
    }
    setAudioError(null)

    setAudioSessionType("playback")

    // resume() has to be called synchronously inside the click: Safari only
    // lets audio start from within a user gesture, and an await before this
    // line would already be outside it. It is called unconditionally: Firefox
    // and Safari keep reporting "running" until a stop's suspend() lands, so a
    // quick stop-then-start that trusted `state` skipped the resume and was
    // then frozen by that suspend. On a running context resume() is a no-op,
    // and it queues behind any suspend still in flight.
    audioContext.resume().catch((err: unknown) => {
      console.error("Failed to resume the metronome AudioContext:", err)
      if (isPlayingRef.current) stopMetronome()
      setAudioError(AUDIO_START_FAILED_MESSAGE)
    })

    // NO_BEAT rather than 0: the first click is START_DELAY_S out and its own
    // paint lights the downbeat when it sounds. A suspended context's clock
    // is frozen until resume() lands, so the delay is measured from wherever
    // the clock restarts.
    beatCountRef.current = 0
    setCurrentBeat(NO_BEAT)
    nextNoteTimeRef.current = audioContext.currentTime + START_DELAY_S

    setIsPlaying(true)
    isPlayingRef.current = true

    cancelScheduler()
    scheduler()
  }

  const handleToggleMetronome = () => {
    if (isPlaying) {
      stopMetronome()
    } else {
      startMetronome()
    }
  }

  const handleTimeSignatureChange = (signature: string) => {
    const next = parseTimeSignature(signature)
    setTimeSignature(signature)
    beatsPerMeasureRef.current = next.beatsPerMeasure
    isCompoundMeterRef.current = next.isCompoundMeter

    // A new meter starts on its downbeat. Clicks already committed to the
    // audio clock still play out; only their paints are dropped, because the
    // cell they would light belongs to the old measure.
    if (isPlayingRef.current) {
      cancelPendingBeatPaints()
      beatCountRef.current = 0
      setCurrentBeat(NO_BEAT)
    }
  }

  // Handle BPM change from slider
  const handleBpmChange = (value: number[]) => {
    onBpmChange(value[0])
  }

  const adjustBpm = (amount: number) => {
    onBpmChange(clampMetronomeBpm(bpm + amount))
  }

  const handleNotesToggle = () => {
    setIsNotesExpanded((expanded) => !expanded)
  }

  // Calculate note durations based on current BPM
  const calculateNoteDurations = () => {
    // Base duration for a quarter note in milliseconds
    // Use displayBpm, the exact tap tempo, which can fall outside the playable range
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
              onClick={handleToggleMetronome}
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

            <Select value={timeSignature} onValueChange={handleTimeSignatureChange}>
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
                min={MIN_METRONOME_BPM}
                max={MAX_METRONOME_BPM}
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
            <span>{MIN_METRONOME_BPM}</span>
            <span>{bpm} BPM</span>
            <span>{MAX_METRONOME_BPM}</span>
          </div>

          {/* The measure, one cell per beat. Useful with the volume down and
              the only way to see where the accents fall in an odd meter. */}
          <BeatIndicator
            beatsPerMeasure={beatsPerMeasure}
            currentBeat={currentBeat}
            isPlaying={isPlaying}
            isCompoundMeter={isCompoundMeter}
          />

          {/* Law 1: a fault is inverse video plus blink, never a red box. */}
          {audioError && (
            <div
              role="alert"
              className="w-full bg-fill-bright text-on-fill px-3 py-1 text-sm uppercase tracking-body text-center"
            >
              <span className="blink" aria-hidden="true">
                ✳✳{" "}
              </span>
              Fault: {audioError}
            </div>
          )}
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
              {(displayBpm > MAX_METRONOME_BPM || displayBpm < MIN_METRONOME_BPM) &&
                ` Metronome playback is limited to ${MIN_METRONOME_BPM}–${MAX_METRONOME_BPM} BPM, but delay calculations remain accurate at any tempo.`}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

