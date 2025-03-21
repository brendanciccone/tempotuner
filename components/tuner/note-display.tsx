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
    if (!signalDetected) return "text-muted-foreground opacity-50"
    // Always show as in-tune (green) when detecting if tuningStatus is null
    if (!tuningStatus) return "text-green-500"
    if (tuningStatus === "flat" || tuningStatus === "sharp") return "text-red-500"
    if (tuningStatus === "in-tune") return "text-green-500"
    return "text-green-500" // Fallback to green for any other state
  }

  // Show note when signal is detected, don't require isNoteLocked
  const showNote = signalDetected
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

