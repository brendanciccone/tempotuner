import { detectPitchYIN, getRMS, SIGNAL_THRESHOLD } from "@/utils/audio-processing"

// Noise floor tracking constants
const NOISE_FLOOR_ALPHA = 0.05 // Slow EMA for ambient noise estimation
const NOISE_FLOOR_MULTIPLIER = 3 // Signal must be N× above noise floor
const NOISE_FLOOR_MIN = SIGNAL_THRESHOLD // Never go below the hard minimum

const PREFERRED_SAMPLE_RATE = 44100

/**
 * Discriminated outcome of {@link AudioAnalyzer.initialize}.
 *
 * `success` means the mic stream is live and the AudioContext is running.
 * `needs-gesture` means the AudioContext was created but is still suspended
 * after `resume()` (typical on iOS Safari without a user gesture). The caller
 * should surface a "tap to start" UI that calls {@link AudioAnalyzer.resume}.
 * `error` carries an actionable message already shown to the user.
 */
export type InitResult = "success" | "needs-gesture" | "error"

/**
 * Categorised failure reason. Used by {@link AudioAnalyzer} to map raw
 * errors / feature-detection results to user-facing messages.
 */
type FailureReason =
  | "insecure-context"
  | "unsupported-browser"
  | "permission-denied"
  | "no-microphone"
  | "microphone-busy"
  | "constraints-unsupported"
  | "aborted"
  | "audio-context-unavailable"
  | "unknown"

const FAILURE_MESSAGES: Record<FailureReason, string> = {
  "insecure-context":
    "Microphone access requires a secure connection (HTTPS). Please reload over HTTPS.",
  "unsupported-browser":
    "This browser doesn't support microphone input. Try the latest Chrome, Firefox, Safari, or Edge — and avoid in-app browsers (Instagram, TikTok, etc.).",
  "permission-denied":
    "Microphone access denied. Allow microphone access in your browser settings, then try again.",
  "no-microphone":
    "No microphone was found. Please connect a microphone and try again.",
  "microphone-busy":
    "Your microphone is in use by another app. Close other apps using the mic and try again.",
  "constraints-unsupported":
    "Your microphone doesn't support the requested settings. Try a different input device.",
  "aborted": "Microphone request was cancelled. Try again to start the tuner.",
  "audio-context-unavailable":
    "Web Audio is not available in this browser. Please use a modern browser.",
  "unknown": "Couldn't start the tuner. Please try again.",
}

/**
 * AudioAnalyzer class handles microphone input and pitch detection
 *
 * Uses FFT size of 8192 for good low-frequency resolution.
 * At 44100Hz sample rate:
 * - 8192 samples ≈ 186ms of audio
 * - Minimum detectable period = 4096 samples → ~10.8Hz
 * - Supports all standard instrument tuning ranges
 *
 * Browser compatibility:
 * - Falls back to getByteTimeDomainData when getFloatTimeDomainData is missing (older iOS Safari)
 * - Falls back to default sample rate if 44100 is rejected by the hardware (Firefox / Linux / some USB interfaces)
 * - Falls back to `webkitAudioContext` when the unprefixed constructor is missing
 * - Handles AudioContext "interrupted" state (tab switch, lock screen on iOS)
 * - Surfaces a `needs-gesture` outcome when iOS Safari leaves the context suspended after resume()
 * - Maps DOMException names to specific user-facing messages
 */
export class AudioAnalyzer {
  private audioContext: AudioContext | null = null
  private analyser: AnalyserNode | null = null
  private source: MediaStreamAudioSourceNode | null = null
  private stream: MediaStream | null = null
  private buffer: Float32Array<ArrayBuffer> | null = null
  private byteBuffer: Uint8Array<ArrayBuffer> | null = null // Fallback for older iOS Safari
  private useFloatData: boolean = true // false when getFloatTimeDomainData is unavailable
  private isInitialized = false
  private onError: (message: string) => void

  // Adaptive noise floor
  private noiseFloor: number = SIGNAL_THRESHOLD
  private noiseFloorInitialized: boolean = false

  // FFT size of 8192 provides better low-frequency accuracy:
  // - At 44100Hz: 8192 samples ≈ 186ms of audio
  // - Minimum detectable period = 4096 samples → ~10.8Hz
  // - Much better accuracy for bass guitar/low piano (E2 = 82.4Hz)
  // - The extra latency is offset by EMA smoothing in NoteDetector
  private readonly FFT_SIZE = 8192

  constructor(onError: (message: string) => void) {
    this.onError = onError
  }

  /**
   * Initialise the audio context and microphone access.
   *
   * Returns:
   * - "success" when the mic stream is live and the context is running
   * - "needs-gesture" when the context is still suspended (iOS Safari without user gesture)
   * - "error" when initialisation failed; an actionable message has been delivered via onError
   */
  async initialize(): Promise<InitResult> {
    // 1. Secure-context check — getUserMedia silently fails over plain HTTP
    if (typeof window !== "undefined" && window.isSecureContext === false) {
      this.fail("insecure-context")
      return "error"
    }

    // 2. Feature detection — covers in-app webviews, ancient browsers, locked-down profiles
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices ||
      typeof navigator.mediaDevices.getUserMedia !== "function"
    ) {
      this.fail("unsupported-browser")
      return "error"
    }

    try {
      // 3. Create AudioContext with vendor-prefix fallback and sample-rate fallback
      if (!this.audioContext) {
        const created = this.createAudioContext()
        if (!created) {
          this.fail("audio-context-unavailable")
          return "error"
        }
        this.audioContext = created
      }

      // 4. Try to resume — handles "suspended" (initial) and "interrupted" (tab switch / lock screen)
      await this.tryResume()

      // 5. Request microphone with pitch-detection-friendly constraints
      if (!this.stream) {
        this.stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          },
        })
      }

      // 6. Wire up the analyser
      this.analyser = this.audioContext.createAnalyser()
      this.analyser.fftSize = this.FFT_SIZE
      this.analyser.smoothingTimeConstant = 0 // Low smoothing for responsive pitch tracking

      this.source = this.audioContext.createMediaStreamSource(this.stream)
      this.source.connect(this.analyser)

      this.buffer = new Float32Array(this.analyser.fftSize)

      // 7. Detect whether getFloatTimeDomainData is available (missing on older iOS Safari)
      if (typeof this.analyser.getFloatTimeDomainData !== "function") {
        this.useFloatData = false
        this.byteBuffer = new Uint8Array(this.analyser.fftSize) as Uint8Array<ArrayBuffer>
      }

      this.isInitialized = true

      // 8. iOS Safari: even after resume(), the context can stay suspended without
      // an in-gesture call. Surface that to the UI so it can prompt for a tap.
      if (this.audioContext.state === "suspended") {
        return "needs-gesture"
      }

      return "success"
    } catch (err) {
      this.fail(this.classifyError(err), err)
      return "error"
    }
  }

  /**
   * Map a DOMException (or any unknown error) to a {@link FailureReason}.
   * Names follow the WebRTC spec: https://w3c.github.io/mediacapture-main/#methods
   */
  private classifyError(err: unknown): FailureReason {
    if (
      typeof err === "object" &&
      err !== null &&
      "name" in err &&
      typeof err.name === "string"
    ) {
      switch (err.name) {
        case "NotAllowedError":
        case "PermissionDeniedError": // legacy alias
          return "permission-denied"
        case "NotFoundError":
        case "DevicesNotFoundError": // legacy alias
          return "no-microphone"
        case "NotReadableError":
        case "TrackStartError": // legacy alias
          return "microphone-busy"
        case "OverconstrainedError":
        case "ConstraintNotSatisfiedError": // legacy alias
          return "constraints-unsupported"
        case "SecurityError":
          return "insecure-context"
        case "AbortError":
          return "aborted"
        case "TypeError":
          // getUserMedia throws TypeError when called with no audio/video constraints
          // or in non-secure contexts on some browsers
          return "unsupported-browser"
      }
    }
    return "unknown"
  }

  /**
   * Create an AudioContext, preferring 44100Hz to avoid iOS resampling artefacts
   * but falling back to the device default if that rate is unsupported.
   */
  private createAudioContext(): AudioContext | null {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext

    if (typeof AudioContextClass !== "function") {
      return null
    }

    // Try preferred sample rate first
    try {
      return new AudioContextClass({ sampleRate: PREFERRED_SAMPLE_RATE })
    } catch {
      // Hardware doesn't support 44100 (some Firefox/Linux/USB combos) — fall back to default
    }

    try {
      return new AudioContextClass()
    } catch {
      return null
    }
  }

  /**
   * Attempt to resume the AudioContext. Swallows errors — the caller checks
   * `state` afterwards to decide whether a user gesture is still required.
   */
  private async tryResume(): Promise<void> {
    if (!this.audioContext) return
    // iOS Safari adds an "interrupted" state that isn't in the standard typedef
    const state = this.audioContext.state as string
    if (state === "suspended" || state === "interrupted") {
      try {
        await this.audioContext.resume()
      } catch {
        // Resume failure is expected on iOS without a user gesture; UI handles it.
      }
    }
  }

  private fail(reason: FailureReason, err?: unknown): void {
    if (err !== undefined) {
      console.error("AudioAnalyzer:", reason, err)
    }
    this.onError(FAILURE_MESSAGES[reason])
  }

  /**
   * Get the current audio buffer (time-domain data as Float32Array)
   * Returns null if not initialized.
   *
   * On older iOS Safari where getFloatTimeDomainData doesn't exist, falls back to
   * getByteTimeDomainData and converts unsigned bytes [0, 255] to floats [-1, 1].
   */
  getAudioData(): Float32Array<ArrayBuffer> | null {
    if (!this.isInitialized || !this.analyser || !this.buffer) return null

    if (this.useFloatData) {
      this.analyser.getFloatTimeDomainData(this.buffer)
    } else if (this.byteBuffer) {
      this.analyser.getByteTimeDomainData(this.byteBuffer)
      for (let i = 0; i < this.byteBuffer.length; i++) {
        // Convert [0, 255] → [-1.0, 1.0] (128 maps to 0.0)
        this.buffer[i] = (this.byteBuffer[i] - 128) / 128
      }
    }

    return this.buffer
  }

  /**
   * Get the sample rate of the audio context (whatever the hardware actually gave us).
   */
  getSampleRate(): number {
    return this.audioContext?.sampleRate || PREFERRED_SAMPLE_RATE
  }

  /**
   * Get the effective signal threshold, accounting for ambient noise.
   * The threshold is max(hardMin, noiseFloor * multiplier), so it adapts
   * to the environment — a quiet room gets a lower threshold (more sensitive),
   * a noisy room gets a higher threshold (fewer false triggers).
   */
  getEffectiveThreshold(): number {
    return Math.max(NOISE_FLOOR_MIN, this.noiseFloor * NOISE_FLOOR_MULTIPLIER)
  }

  /**
   * Update the ambient noise floor estimate.
   * Call this with the current RMS when no signal is detected (silence frames).
   * Uses a slow EMA so it adapts gradually to changing environments.
   */
  updateNoiseFloor(rms: number): void {
    if (!this.noiseFloorInitialized) {
      this.noiseFloor = rms
      this.noiseFloorInitialized = true
    } else {
      this.noiseFloor += NOISE_FLOOR_ALPHA * (rms - this.noiseFloor)
    }
  }

  /**
   * Resume the AudioContext if it was suspended or interrupted.
   * Call this from a user-gesture handler (button click) on iOS Safari, or on
   * visibility change when the user returns to the tab.
   *
   * Returns true if the context is running after the call, false otherwise.
   */
  async resume(): Promise<boolean> {
    if (!this.audioContext) return false
    await this.tryResume()
    return this.audioContext.state === "running"
  }

  /**
   * Whether the audio context is still suspended and needs a user gesture
   * to resume. Used by the UI to decide whether to show a "tap to start" prompt.
   */
  isSuspended(): boolean {
    if (!this.audioContext) return false
    const state = this.audioContext.state as string
    return state === "suspended" || state === "interrupted"
  }

  /**
   * Detect pitch using YIN algorithm
   * Returns frequency in Hz, or 0 if no pitch detected
   */
  detectPitch(buffer: Float32Array<ArrayBuffer>): number {
    if (!this.audioContext) return 0
    return detectPitchYIN(buffer, this.audioContext.sampleRate)
  }

  /**
   * Release all resources. Returns a Promise that resolves when the AudioContext
   * has fully closed — important to await before re-creating a context (retry flow),
   * since the Web Audio spec only releases creation-blocking resources after close()
   * resolves. Browsers limit concurrent AudioContexts; on Safari/iOS this race is
   * a known cause of flaky mic re-init.
   *
   * The unmount path is allowed to fire-and-forget; only explicit retry must await.
   */
  async cleanup(): Promise<void> {
    if (this.source) {
      this.source.disconnect()
      this.source = null
    }

    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop())
      this.stream = null
    }

    // Capture the close() promise before nulling the ref so callers can await it.
    const context = this.audioContext
    this.audioContext = null
    this.analyser = null
    this.buffer = null
    this.byteBuffer = null
    this.isInitialized = false

    if (context) {
      try {
        await context.close()
      } catch {
        // Closing an already-closed context throws on some browsers; ignore.
      }
    }
  }
}
