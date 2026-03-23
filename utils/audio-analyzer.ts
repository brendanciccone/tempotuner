import { detectPitchYIN, getRMS, SIGNAL_THRESHOLD } from "@/utils/audio-processing"

// Noise floor tracking constants
const NOISE_FLOOR_ALPHA = 0.05 // Slow EMA for ambient noise estimation
const NOISE_FLOOR_MULTIPLIER = 3 // Signal must be N× above noise floor
const NOISE_FLOOR_MIN = SIGNAL_THRESHOLD // Never go below the hard minimum

/**
 * AudioAnalyzer class handles microphone input and pitch detection
 *
 * Uses FFT size of 8192 for good low-frequency resolution.
 * At 44100Hz sample rate:
 * - 8192 samples ≈ 186ms of audio
 * - Minimum detectable period = 4096 samples → ~10.8Hz
 * - Supports all standard instrument tuning ranges
 *
 * iOS Safari compatibility:
 * - Falls back to getByteTimeDomainData when getFloatTimeDomainData is missing
 * - Handles AudioContext "interrupted" state (tab switch, lock screen)
 * - Forces 44100Hz sample rate to avoid iOS resampling distortion
 */
export class AudioAnalyzer {
  private audioContext: AudioContext | null = null
  private analyser: AnalyserNode | null = null
  private source: MediaStreamAudioSourceNode | null = null
  private stream: MediaStream | null = null
  private buffer: Float32Array<ArrayBuffer> | null = null
  private byteBuffer: Uint8Array<ArrayBuffer> | null = null // Fallback for iOS Safari
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
   * Initialize the audio context and microphone access
   * Returns true on success, false on failure
   */
  async initialize(): Promise<boolean> {
    try {
      // Create audio context with proper fallbacks
      if (!this.audioContext) {
        console.log("AudioAnalyzer: Creating new AudioContext")
        const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
        // Force 44100Hz sample rate — iOS Safari can produce distortion
        // when resampling between its native 48000Hz and the default rate
        this.audioContext = new AudioContextClass({ sampleRate: 44100 })
      }

      // Handle suspended (initial) and interrupted (tab switch / lock screen) states
      if (this.audioContext.state === "suspended" || this.audioContext.state === "interrupted" as string) {
        console.log(`AudioAnalyzer: Resuming ${this.audioContext.state} AudioContext`)
        await this.audioContext.resume()
      }

      // Request microphone access with settings optimized for pitch detection
      // Disable all processing that could interfere with pitch detection
      if (!this.stream) {
        console.log("AudioAnalyzer: Requesting microphone stream")
        this.stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          },
        })
        console.log("AudioAnalyzer: Microphone stream obtained successfully")
      }

      // Set up analyzer with optimized settings for pitch detection
      this.analyser = this.audioContext.createAnalyser()
      this.analyser.fftSize = this.FFT_SIZE
      // Low smoothing for responsive pitch tracking
      this.analyser.smoothingTimeConstant = 0

      // Connect audio source to analyzer
      this.source = this.audioContext.createMediaStreamSource(this.stream)
      this.source.connect(this.analyser)

      // Create buffers for analysis
      this.buffer = new Float32Array(this.analyser.fftSize)

      // Detect whether getFloatTimeDomainData is available (missing on iOS Safari)
      if (typeof this.analyser.getFloatTimeDomainData !== "function") {
        console.log("AudioAnalyzer: getFloatTimeDomainData not available, using byte fallback")
        this.useFloatData = false
        this.byteBuffer = new Uint8Array(this.analyser.fftSize) as Uint8Array<ArrayBuffer>
      }

      this.isInitialized = true
      return true
    } catch (err) {
      console.error("Error accessing microphone:", err)
      this.onError("Microphone access denied. Please allow microphone access and reload the page.")
      return false
    }
  }

  /**
   * Get the current audio buffer (time-domain data as Float32Array)
   * Returns null if not initialized
   *
   * On iOS Safari where getFloatTimeDomainData doesn't exist, falls back to
   * getByteTimeDomainData and converts unsigned bytes [0, 255] to floats [-1, 1].
   */
  getAudioData(): Float32Array<ArrayBuffer> | null {
    if (!this.isInitialized || !this.analyser || !this.buffer) return null

    if (this.useFloatData) {
      this.analyser.getFloatTimeDomainData(this.buffer)
    } else if (this.byteBuffer) {
      // Fallback: getByteTimeDomainData returns unsigned bytes where 128 = silence
      this.analyser.getByteTimeDomainData(this.byteBuffer)
      for (let i = 0; i < this.byteBuffer.length; i++) {
        // Convert [0, 255] → [-1.0, 1.0] (128 maps to 0.0)
        this.buffer[i] = (this.byteBuffer[i] - 128) / 128
      }
    }

    return this.buffer
  }

  /**
   * Get the sample rate of the audio context
   */
  getSampleRate(): number {
    return this.audioContext?.sampleRate || 44100
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
   * Call this on visibility change (user returns to tab) to handle
   * iOS Safari's "interrupted" state.
   */
  async resume(): Promise<void> {
    if (!this.audioContext) return
    const state = this.audioContext.state as string
    if (state === "suspended" || state === "interrupted") {
      try {
        await this.audioContext.resume()
        console.log("AudioAnalyzer: Resumed AudioContext from", state)
      } catch {
        console.warn("AudioAnalyzer: Failed to resume AudioContext")
      }
    }
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
   * Clean up all resources
   * Call this when the tuner is stopped
   */
  cleanup(): void {
    if (this.source) {
      this.source.disconnect()
      this.source = null
    }

    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop())
      this.stream = null
    }

    if (this.audioContext) {
      this.audioContext.close()
      this.audioContext = null
    }

    this.analyser = null
    this.buffer = null
    this.byteBuffer = null
    this.isInitialized = false
  }
}
