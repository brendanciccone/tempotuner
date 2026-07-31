import { cn } from "@/lib/utils"
import { IN_TUNE_CENTS, METER_RANGE_CENTS } from "@/utils/note-utils"

interface TuningIndicatorProps {
  cents: number
  tuningStatus: "flat" | "sharp" | "in-tune" | null
  signalDetected: boolean
}

export function TuningIndicator({ cents, tuningStatus, signalDetected }: TuningIndicatorProps) {
  // Only require signal detection, not note locking
  const showActiveIndicator = signalDetected && tuningStatus !== null
  const isInTune = signalDetected && tuningStatus === "in-tune"

  // Law 1: one gas, many intensities. In tune is the brightest thing on the
  // panel and the only lit fill; off-pitch is the same hue, dimmer and unlit.
  //
  // The idle needle sits at --ink-faint rather than --ink-trace. Trace measures
  // 1.98:1, under the 3:1 floor for non-text UI, and this is the reading at
  // rest rather than ornament — the same reason the source framework parks an
  // OFF toggle thumb at faint too.
  const needleClasses = isInTune
    ? "bg-fill-bright box-glow"
    : showActiveIndicator
      ? "bg-ink-dim"
      : "bg-ink-faint"

  // One cent-to-percent mapping, shared by the needle, the zone and the scale
  // labels, so all three agree. There used to be a 1.1 multiplier here with no
  // matching adjustment anywhere else, which put the far edges at ±45.5 cents
  // while the labels claimed ±50, and widened the drawn zone to ±9.09 cents
  // against a classifier that calls ±5 in tune. Between 5 and 9 cents the
  // needle sat inside the lit target while the panel read "sharp".
  const percentPerCent = 50 / METER_RANGE_CENTS
  const clampedCents = Math.min(Math.max(cents, -METER_RANGE_CENTS), METER_RANGE_CENTS)
  const needleOffset = showActiveIndicator ? 50 + clampedCents * percentPerCent : 50
  const zoneHalfWidth = IN_TUNE_CENTS * percentPerCent

  return (
    <div className="flex flex-col items-center w-full mb-6">
      <div className="relative w-full h-16 border-2 border-stroke-dim rounded-sm bg-screen-well overflow-hidden">
        {/* Centre rule — the target the needle is read against. */}
        <div className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-stroke-dim" />

        {/* The in-tune zone. Lit only once the note is actually inside it — but
            legible before that, because while you are still approaching it this
            is the target you are aiming the needle at.

            Geometry is inline rather than a Tailwind class because it is not a
            style choice: it is IN_TUNE_CENTS expressed in percent, and the
            needle crossing this edge has to be the same instant the status flips
            to "in tune". A literal class here is what let the two drift apart. */}
        <div
          data-testid="in-tune-zone"
          className={cn(
            "absolute inset-y-0 border-x-2",
            isInTune ? "border-fill bg-fill/12" : "border-ink-faint",
          )}
          style={{ left: `${50 - zoneHalfWidth}%`, width: `${zoneHalfWidth * 2}%` }}
        />

        {/* Indicator needle. The step is instant — a redrawn screen has no
            in-between frames — but the travel is eased so the reading stays
            readable while the pitch moves. Only `left` is inline, because only
            `left` is dynamic; keeping the transition in classes leaves it
            subject to the reduced-motion rules. */}
        <div
          data-testid="needle"
          className={cn(
            "absolute inset-y-2 w-1 -translate-x-1/2 transition-[left] duration-150 ease-in-out motion-reduce:transition-none",
            needleClasses,
          )}
          style={{ left: `${needleOffset}%` }}
        />

        {/* Scale marks, in the micro face — bit labels, not body text. Read
            from the same constant as the needle, so they cannot claim a range
            the meter does not actually draw. */}
        <div className="absolute inset-x-2 bottom-1 flex justify-between font-micro text-micro tracking-micro text-ink-faint">
          <span>-{METER_RANGE_CENTS}</span>
          <span>0</span>
          <span>+{METER_RANGE_CENTS}</span>
        </div>
      </div>

      {/* The machine's voice. Inverse video when the note is in tune, a ruled
          line when it is only reporting. */}
      <div
        className={cn(
          "w-full mt-2 px-3 py-1 text-sm uppercase tracking-body text-center tabular-nums",
          isInTune
            ? "bg-fill text-on-fill box-glow"
            : "border-y-2 border-stroke-dim text-ink",
        )}
        role="status"
        aria-live="polite"
      >
        {signalDetected && tuningStatus === "flat" && (
          <span>
            <span aria-hidden="true">▲</span> Status:Tune Up
          </span>
        )}
        {signalDetected && tuningStatus === "sharp" && (
          <span>
            <span aria-hidden="true">▼</span> Status:Tune Down
          </span>
        )}
        {isInTune && (
          <span>
            <span aria-hidden="true">✳</span> Status:In Tune <span aria-hidden="true">✳</span>
          </span>
        )}
        {(!signalDetected || tuningStatus === null) && <span>Status:Awaiting Signal</span>}
      </div>
    </div>
  )
}
