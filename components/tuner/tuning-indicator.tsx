import { ArrowUp, ArrowDown, Check } from "lucide-react"

interface TuningIndicatorProps {
  cents: number
  tuningStatus: "flat" | "sharp" | "in-tune" | null
  signalDetected: boolean
  isNoteLocked: boolean // Add isNoteLocked prop
}

export function TuningIndicator({ cents, tuningStatus, signalDetected, isNoteLocked }: TuningIndicatorProps) {
  // Only require signal detection, not note locking
  const showActiveIndicator = signalDetected
  
  // Determine the needle and status colors consistently
  const getNeedleColor = () => {
    if (!signalDetected) return "bg-gray-400"
    if (!tuningStatus) return "bg-gray-500" // Neutral darker gray when detecting
    return tuningStatus === "in-tune" ? "bg-green-500" : "bg-red-500"
  }

  return (
    <div className="flex flex-col items-center mb-6">
      <div className="relative w-64 h-16 flex items-center justify-center mb-2">
        {/* Tuning Meter */}
        <div className="absolute w-full h-1 bg-muted"></div>
        
        {/* In-tune zone indicator - wider to be more forgiving */}
        <div
          className={`absolute h-1 transition-colors duration-300 ${
            tuningStatus === "in-tune" && signalDetected ? "bg-green-500" : "bg-muted-foreground/30"
          }`}
          style={{
            width: "20%" /* +/- 10 cents = 20% of the total width - more forgiving range */,
            left: "40%" /* Position it in the center (50% - 10%) */,
          }}
        ></div>

        {/* Indicator Needle - Show gray centered one when no signal */}
        <div
          className={`absolute w-1 h-8 transform -translate-x-1/2 transition-all duration-200 ${getNeedleColor()}`}
          style={{
            left: signalDetected && cents !== 0 ? `${50 + Math.min(Math.max(cents * 1.1, -50), 50)}%` : "50%",
          }}
        ></div>
      </div>

      {/* Tuning Status - Add opacity transitions */}
      <div className="flex items-center justify-center h-8">
        {signalDetected && tuningStatus === "flat" && (
          <div className="flex items-center text-red-500 transition-opacity duration-300">
            <ArrowDown className="h-5 w-5 mr-1" />
            <span>Tune Up</span>
          </div>
        )}
        {signalDetected && tuningStatus === "in-tune" && (
          <div className="flex items-center text-green-500 transition-opacity duration-300">
            <Check className="h-5 w-5 mr-1" />
            <span>In Tune</span>
          </div>
        )}
        {signalDetected && tuningStatus === "sharp" && (
          <div className="flex items-center text-red-500 transition-opacity duration-300">
            <ArrowUp className="h-5 w-5 mr-1" />
            <span>Tune Down</span>
          </div>
        )}
        {!tuningStatus && signalDetected && (
          <div className="text-muted-foreground text-sm transition-opacity duration-300">Detecting note...</div>
        )}
        {!signalDetected && (
          <div className="text-muted-foreground text-sm transition-opacity duration-300">Play a note...</div>
        )}
      </div>
    </div>
  )
}

