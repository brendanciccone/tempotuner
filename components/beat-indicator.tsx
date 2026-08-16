import { cn } from "@/lib/utils"
import { accentForBeat } from "@/utils/metronome-timing"

interface BeatIndicatorProps {
  beatsPerMeasure: number
  /** Zero-based index of the beat currently sounding. */
  currentBeat: number
  isPlaying: boolean
  isCompoundMeter: boolean
}

/**
 * The measure, drawn as one cell per beat.
 *
 * Law 1 applies: the meter is carried by brightness and inverse video, never by
 * a second hue. A sounding beat is a solid discharge block; the downbeat is the
 * brightest thing in the row. At rest the accented cells stay legible and the
 * plain ones drop to faint, so the grouping of a compound meter — 6/8 as 3+3 —
 * is readable before the metronome is even running.
 */
export const BeatIndicator = ({
  beatsPerMeasure,
  currentBeat,
  isPlaying,
  isCompoundMeter,
}: BeatIndicatorProps) => {
  const beats = Array.from({ length: Math.max(0, beatsPerMeasure) }, (_, index) => index)

  return (
    <div className="flex flex-col gap-1">
      {/* Hidden from assistive tech on purpose: a live region here would
          announce a new beat several times a second, which is unusable. The
          static line below carries the same information once. */}
      <div data-testid="beat-row" className="flex gap-1" aria-hidden="true">
        {beats.map((index) => {
          const accent = accentForBeat(index, isCompoundMeter)
          const isCurrent = isPlaying && index === currentBeat

          return (
            <div
              key={index}
              data-testid="beat-cell"
              data-accent={accent}
              data-lit={isCurrent}
              className={cn(
                "ac-lamp flex h-8 flex-1 items-center justify-center rounded-sm border-2 text-sm tabular-nums",
                isCurrent && accent === "primary" && "border-fill-bright bg-fill-bright text-on-fill box-glow",
                isCurrent && accent !== "primary" && "border-fill bg-fill text-on-fill box-glow",
                !isCurrent && accent === "primary" && "border-stroke text-ink",
                !isCurrent && accent === "secondary" && "border-stroke text-ink-dim",
                !isCurrent && accent === "regular" && "border-stroke-dim text-ink-faint",
              )}
            >
              {index + 1}
            </div>
          )
        })}
      </div>
      <span className="sr-only">
        {beatsPerMeasure} beats per measure
        {isCompoundMeter ? ", accented in groups of three" : ""}
      </span>
    </div>
  )
}
