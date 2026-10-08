"use client"

import { useState, useEffect, useCallback, useRef, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Metronome } from "@/components/metronome"
import { cn } from "@/lib/utils"

// Anything that owns its own Enter/Space activation. Module scope: it is frozen
// config, and inside the component it would be rebuilt every render and read by
// an effect that does not list it as a dependency.
const INTERACTIVE = "button, [role='button'], [role='tab'], a[href], input, select, textarea"

// An open dropdown list owns every key — arrows, Enter, and letters for its
// typeahead — so nothing typed into it is a tap.
const OPEN_LIST = "[role='listbox']"

/**
 * Whether a key press can be a tap at all. Holding a key auto-repeats it ~30
 * times a second (each repeat read as a tap, so a held key showed ~1800 BPM);
 * a chord with Ctrl/Cmd/Alt is a shortcut; and Tab, Escape, the arrows and the
 * other named keys move focus or drive the focused control. What is left is
 * every printable key, Space and Enter.
 */
const isTapKey = (e: KeyboardEvent): boolean => {
  if (e.repeat || e.isComposing) return false
  if (e.ctrlKey || e.metaKey || e.altKey) return false
  return e.key.length === 1 || e.key === "Enter"
}

const DEFAULT_BPM = 120

export default function TapTempo() {
  const [taps, setTaps] = useState<number[]>([])
  const [bpm, setBpm] = useState<number | null>(null)
  const [isAnimating, setIsAnimating] = useState(false)
  const [isMetronomePlaying, setIsMetronomePlaying] = useState(false)
  const [currentBeat, setCurrentBeat] = useState(0)

  const calculateBPM = useCallback((tapTimes: number[]) => {
    if (tapTimes.length < 2) return null

    // Calculate time differences between taps
    const intervals = []
    for (let i = 1; i < tapTimes.length; i++) {
      intervals.push(tapTimes[i] - tapTimes[i - 1])
    }

    // Calculate average interval
    const averageInterval = intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length

    // Two taps inside the same millisecond would read as Infinity BPM
    if (averageInterval <= 0) return null

    // Convert to BPM (60000 ms in a minute)
    // No upper limit here - we want to calculate the exact BPM
    return Math.round(60000 / averageInterval)
  }, [])

  const handleTap = useCallback(() => {
    const now = Date.now()

    // If it's been more than 2 seconds since last tap, reset
    if (taps.length > 0 && now - taps[taps.length - 1] > 2000) {
      setTaps([now])
      setBpm(null)
      return
    }

    // Keep only the last 8 taps for a more accurate recent tempo
    const newTaps = [...taps, now].slice(-8)
    setTaps(newTaps)

    // Calculate BPM if we have at least 2 taps
    if (newTaps.length >= 2) {
      const calculatedBpm = calculateBPM(newTaps)
      setBpm(calculatedBpm)
    }

    // Trigger animation
    setIsAnimating(true)
    setTimeout(() => setIsAnimating(false), 100)
  }, [taps, calculateBPM])

  // Tapping tempo with any key, from anywhere on the page, is the intended
  // behaviour — but Enter and Space are special: the browser turns them into a
  // click on whatever control has focus. Letting them through here too meant
  // activating ANY control also logged a tap. Measured on the metronome toggle
  // and the +/− tempo keys, both of which quietly corrupted the average.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isActivationKey = e.key === "Enter" || e.code === "Space"
      const target = e.target instanceof Element ? e.target : null
      if (target?.closest(OPEN_LIST)) return
      // The focused control owns this press — including the tap pad, whose
      // native click calls handleTap once on its own.
      if (isActivationKey && target?.closest(INTERACTIVE)) return

      // Space would scroll the page. Cancelled before the tap filter, because
      // a held Space auto-repeats and every repeat scrolls too, tap or not.
      if (e.code === "Space" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault()
      }

      if (!isTapKey(e)) return
      handleTap()
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => {
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [handleTap])

  // Stable on purpose: the metronome reports through an effect keyed on this
  // callback, so a new function every render re-ran that effect on every
  // render — and while the downbeat was lit, each run restarted a 100ms flash
  // that re-rendered this component, which re-ran the effect, for as long as
  // the beat lasted.
  const handleMetronomeStateChange = useCallback((playing: boolean, beat: number) => {
    setIsMetronomePlaying(playing)
    setCurrentBeat(beat)
  }, [])

  // The downbeat lights the pad, so the pad is the visual metronome too. The
  // metronome reports the beat that is sounding, zero-based, so the downbeat
  // is 0 — it used to report the NEXT beat, which lit the pad ahead of the
  // click.
  const isDownbeat = isMetronomePlaying && currentBeat === 0

  // Set when a pointer press has already tapped, so the click that trails it
  // is not counted a second time. Deduping on click.detail instead dropped
  // Firefox's assistive-tech activation, which clicks with detail 1 and sends
  // no pointer event at all.
  const pointerTapPendingRef = useRef(false)

  // A pointer tap counts the moment the finger or button goes down — the
  // musical hit — rather than on release, which adds however long each press
  // was held to every interval. On a phone a click can also be cancelled
  // outright when the finger drifts a few pixels, dropping the tap.
  const handlePadPointerDown = (e: PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return
    pointerTapPendingRef.current = true
    handleTap()
  }

  const handlePadPointerCancel = () => {
    pointerTapPendingRef.current = false
  }

  // Keyboard and assistive-tech activation arrive as a click with no pointer
  // press behind it, and tap here; a pointer press's own click does not.
  const handlePadClick = () => {
    if (pointerTapPendingRef.current) {
      pointerTapPendingRef.current = false
      return
    }
    handleTap()
  }

  const handlePadKeyDown = (e: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== "Enter" && e.key !== " ") return
    // The keyboard is activating the pad, so no pointer press is in flight; a
    // press that was dragged off and never clicked must not swallow this one.
    pointerTapPendingRef.current = false
    // A held Enter makes the browser click the button again on every repeat,
    // ~30 times a second. Cancelling the repeated keydown cancels that click.
    if (e.repeat) e.preventDefault()
  }
  const isLit = isAnimating || isDownbeat

  return (
    <Card className="w-full overflow-hidden pt-0">
      {/* Full-width inverse strip — the machine's own heading for the region. */}
      <div className="bg-fill text-on-fill text-center py-1 px-4 uppercase tracking-display">
        Tap Tempo
      </div>
      <CardContent className="p-4 sm:p-6">
        <div className="flex flex-col items-center w-full">
          {/* BPM Readout — the largest thing on the panel and the only bright
              value in its region. */}
          <div className="text-center w-full mb-6">
            <div className="inline-block bg-fill text-on-fill px-3 py-[3px] text-sm uppercase tracking-display">
              Beats Per Minute
            </div>
            <div
              className={cn(
                "text-6xl sm:text-7xl tabular-nums select-none tracking-display mt-2",
                bpm === null ? "text-ink-faint text-glow-none" : "text-ink-bright text-glow",
              )}
            >
              {bpm !== null ? bpm : "---"}
            </div>
          </div>

          {/* The gloved-finger touch pad: a box, with the label parked top-left.
              A real <button>, so focus, activation and disabled semantics are
              the browser's. Its keyboard activation arrives here as a click —
              the window listener above deliberately steps aside for it, because
              handling the keydown too counted one Enter as two taps a zero
              interval apart and read 346 BPM for a 120 BPM input. */}
          <button
            type="button"
            className={cn(
              // touch-none: a touch on the pad is always a press, never the
              // start of a scroll or pinch. Taps count on pointerdown, before a
              // browser decides a touch is a pan, so without it a swipe that
              // began here was read as a beat.
              "ac-lamp w-full mb-6 min-h-[96px] flex items-start rounded-lg border-2 px-4 py-3 text-left text-xl uppercase tracking-display cursor-pointer select-none touch-none",
              isLit
                ? "bg-fill text-on-fill border-fill box-glow"
                : "bg-transparent text-ink border-stroke text-glow",
              "focus:outline-none focus-visible:outline-2 focus-visible:outline-dashed focus-visible:outline-ink-dim focus-visible:outline-offset-[3px]",
            )}
            onPointerDown={handlePadPointerDown}
            onPointerCancel={handlePadPointerCancel}
            onClick={handlePadClick}
            onKeyDown={handlePadKeyDown}
            data-lit={isLit}
            aria-label="Tap to set tempo"
          >
            <span className="pointer-events-none">Tap</span>
          </button>

          {/* Metronome Section */}
          <div className="w-full">
            <Metronome
              bpm={bpm ?? DEFAULT_BPM}
              onBpmChange={(newBpm) => {
                // Set our tap tempo BPM without any limits
                setBpm(newBpm)
              }}
              onStateChange={handleMetronomeStateChange}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
