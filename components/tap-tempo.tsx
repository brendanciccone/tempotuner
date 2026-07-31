"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Metronome } from "@/components/metronome"
import { cn } from "@/lib/utils"

// Anything that owns its own Enter/Space activation. Module scope: it is frozen
// config, and inside the component it would be rebuilt every render and read by
// an effect that does not list it as a dependency.
const INTERACTIVE = "button, [role='button'], [role='tab'], a[href], input, select, textarea"

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
      // The focused control owns this press — including the tap pad, whose
      // native click calls handleTap once on its own.
      if (isActivationKey && target?.closest(INTERACTIVE)) return

      // Prevent spacebar from scrolling the page
      if (e.code === "Space") {
        e.preventDefault()
      }
      handleTap()
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => {
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [handleTap])

  // Handle metronome state changes
  const handleMetronomeStateChange = (playing: boolean, beat: number) => {
    setIsMetronomePlaying(playing)
    setCurrentBeat(beat)

    // Animate tap button on beat 1 (regardless of any other conditions)
    if (playing && beat === 1) {
      setIsAnimating(true)
      setTimeout(() => setIsAnimating(false), 100)
    }
  }

  // The downbeat lights the pad, so the pad is the visual metronome too
  const isDownbeat = isMetronomePlaying && currentBeat === 1
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
              "w-full mb-6 min-h-[96px] flex items-start rounded-lg border-2 px-4 py-3 text-left text-xl uppercase tracking-display cursor-pointer select-none",
              isLit
                ? "bg-fill text-on-fill border-fill box-glow"
                : "bg-transparent text-ink border-stroke text-glow",
              "focus:outline-none focus-visible:outline-2 focus-visible:outline-dashed focus-visible:outline-ink-dim focus-visible:outline-offset-[3px]",
            )}
            onClick={handleTap}
            aria-label="Tap to set tempo"
          >
            <span className="pointer-events-none">Tap</span>
          </button>

          {/* Metronome Section */}
          <div className="w-full">
            <Metronome
              initialBpm={bpm || 120}
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
