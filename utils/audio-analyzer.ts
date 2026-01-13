import { detectPitchYIN, getRMS } from "@/utils/audio-processing"

/**
 * AudioAnalyzer class handles microphone input and pitch detection
 * 
 * Uses a larger FFT size (4096) for better low-frequency detection.
 * At 44100Hz sample rate:
 * - 4096 samples = ~93ms of audio
 * - Minimum detectable frequency = 44100/4096 ≈ 10.8Hz
 * - This supports all standard instrument tuning ranges
 */
export class AudioAnalyzer {
  private audioContext: AudioContext | null = null
  private analyser: AnalyserNode | null = null
  private source: MediaStreamAudioSourceNode | null = null
  private stream: MediaStream | null = null
  private buffer: Float32Array<ArrayBuffer> | null = null
  private isInitialized = false
  private onError: (message: string) => void

  // FFT size of 4096 provides good balance between:
  // - Frequency resolution for low notes (E2 = 82.4Hz needs good resolution)
  // - Latency (4096 samples at 44100Hz ≈ 93ms)
  private readonly FFT_SIZE = 4096

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
        this.audioContext = new AudioContextClass()
      } else if (this.audioContext.state === "suspended") {
        console.log("AudioAnalyzer: Resuming suspended AudioContext")
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

      // Create buffer for analysis (time-domain data for YIN algorithm)
      this.buffer = new Float32Array(this.analyser.fftSize)

      this.isInitialized = true
      return true
    } catch (err) {
      console.error("Error accessing microphone:", err)
      this.onError("Microphone access denied. Please allow microphone access and reload the page.")
      return false
    }
  }

  /**
   * Get the current audio buffer (time-domain data)
   * Returns null if not initialized
   */
  getAudioData(): Float32Array<ArrayBuffer> | null {
    if (!this.isInitialized || !this.analyser || !this.buffer) return null

    this.analyser.getFloatTimeDomainData(this.buffer)
    return this.buffer
  }

  /**
   * Get the sample rate of the audio context
   */
  getSampleRate(): number {
    return this.audioContext?.sampleRate || 44100
  }

  /**
   * Get the RMS level of the current buffer
   * Useful for signal detection
   */
  getCurrentRMS(): number {
    const buffer = this.getAudioData()
    if (!buffer) return 0
    return getRMS(buffer)
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
    this.isInitialized = false
  }
}
