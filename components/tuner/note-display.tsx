interface NoteDisplayProps {
  note: string
  frequency: number | null
  signalDetected: boolean
  tuningStatus: "flat" | "sharp" | "in-tune" | null
  cents: number
  isNoteLocked: boolean
}

export function NoteDisplay({ note, frequency, signalDetected, tuningStatus, cents, isNoteLocked }: NoteDisplayProps) {
  // Get the color for the note display based on tuning status
  const getNoteDisplayColor = () => {
    if (!signalDetected || tuningStatus === null) return "text-muted-foreground opacity-50"
    if (tuningStatus === "flat" || tuningStatus === "sharp") return "text-red-500"
    if (tuningStatus === "in-tune") return "text-emerald-500"
    return "text-muted-foreground opacity-70" // Fallback for any other state
  }

  // Show note when signal is detected AND tuningStatus is not null
  const showNote = signalDetected && tuningStatus !== null && note !== "---"
  const showFrequency = frequency && showNote

  return (
    <div className="text-center w-full mb-6">
      <div
        className={`text-6xl sm:text-7xl font-bold tabular-nums select-none tracking-tighter transition-colors duration-300 ${getNoteDisplayColor()}`}
      >
        {showNote ? note : "---"}
      </div>
      <div className="text-sm text-muted-foreground mt-1 font-medium transition-opacity duration-300">
        {showFrequency
          ? `${frequency.toFixed(1)} Hz (${cents > 0 ? "+" : ""}${cents} ct)`
          : "FREQUENCY"}
      </div>
    </div>
  )
}

