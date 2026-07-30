import { cn } from "@/lib/utils"

interface NoteDisplayProps {
  note: string
  frequency: number | null
  signalDetected: boolean
  tuningStatus: "flat" | "sharp" | "in-tune" | null
  cents: number
}

export function NoteDisplay({ note, frequency, signalDetected, tuningStatus, cents }: NoteDisplayProps) {
  // Show note when signal is detected AND tuningStatus is not null
  const showNote = signalDetected && tuningStatus !== null && note !== "---"
  const showFrequency = frequency !== null && showNote

  return (
    <div className="text-center w-full mb-6">
      {/* Inverse video: the label is the machine naming the reading. */}
      <div className="inline-block bg-fill text-on-fill px-3 py-[3px] text-sm uppercase tracking-display">
        Note
      </div>
      <div
        className={cn(
          "text-6xl sm:text-7xl tabular-nums select-none tracking-display mt-2",
          // Glow is the signal of energization: a dead input does not glow.
          showNote ? "text-ink-bright text-glow" : "text-ink-faint text-glow-none",
        )}
      >
        {showNote ? note : "---"}
      </div>
      <div className="text-sm text-ink-dim uppercase tracking-body mt-2 tabular-nums">
        {showFrequency
          ? `${frequency.toFixed(1)} Hz · ${cents > 0 ? "+" : ""}${cents} ct`
          : "Frequency —"}
      </div>
    </div>
  )
}
