import { describe, expect, it, vi, beforeEach, afterEach } from "vitest"

// ----------------------------------------------------------------
// Mock browser APIs that don't exist in jsdom
// ----------------------------------------------------------------

const mockGetUserMedia = vi.fn()
const mockAudioContextResume = vi.fn().mockResolvedValue(undefined)
const mockAudioContextClose = vi.fn().mockResolvedValue(undefined)
const mockSourceConnect = vi.fn()
const mockSourceDisconnect = vi.fn()
const mockTrackStop = vi.fn()
const mockGetFloatTimeDomainData = vi.fn()

const createMockAudioContext = (stateOverride?: string) => {
  return class MockAudioContext {
    state = stateOverride ?? "running"
    sampleRate = 44100
    resume = mockAudioContextResume
    close = mockAudioContextClose
    createAnalyser = () => ({
      fftSize: 0,
      smoothingTimeConstant: 0,
      getFloatTimeDomainData: mockGetFloatTimeDomainData,
    })
    createMediaStreamSource = () => ({
      connect: mockSourceConnect,
      disconnect: mockSourceDisconnect,
    })
  }
}

const mockStream = {
  getTracks: () => [{ stop: mockTrackStop }],
}

beforeEach(() => {
  vi.clearAllMocks()

  // Mock AudioContext as a proper class
  vi.stubGlobal("AudioContext", createMockAudioContext())

  // Mock getUserMedia
  if (!navigator.mediaDevices) {
    Object.defineProperty(navigator, "mediaDevices", {
      value: { getUserMedia: mockGetUserMedia },
      writable: true,
      configurable: true,
    })
  } else {
    navigator.mediaDevices.getUserMedia = mockGetUserMedia
  }

  mockGetUserMedia.mockResolvedValue(mockStream)
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ----------------------------------------------------------------
// AudioAnalyzer unit tests
// ----------------------------------------------------------------

import { AudioAnalyzer } from "@/utils/audio-analyzer"

describe("AudioAnalyzer", () => {
  it("requests microphone permissions during initialize()", async () => {
    const onError = vi.fn()
    const analyzer = new AudioAnalyzer(onError)

    const success = await analyzer.initialize()

    expect(success).toBe(true)
    expect(mockGetUserMedia).toHaveBeenCalledWith({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    })
    expect(onError).not.toHaveBeenCalled()

    analyzer.cleanup()
  })

  it("returns false and calls onError when microphone access is denied", async () => {
    mockGetUserMedia.mockRejectedValueOnce(new DOMException("Permission denied"))

    const onError = vi.fn()
    const analyzer = new AudioAnalyzer(onError)

    const success = await analyzer.initialize()

    expect(success).toBe(false)
    expect(onError).toHaveBeenCalledWith(
      "Microphone access denied. Please allow microphone access and reload the page."
    )
  })

  it("handles missing AudioContext gracefully", async () => {
    vi.stubGlobal("AudioContext", undefined)
    // Also remove the webkit fallback
    vi.stubGlobal("webkitAudioContext", undefined)

    const onError = vi.fn()
    const analyzer = new AudioAnalyzer(onError)

    const success = await analyzer.initialize()

    expect(success).toBe(false)
    expect(onError).toHaveBeenCalled()
  })

  it("resumes a suspended AudioContext during initialize()", async () => {
    vi.stubGlobal("AudioContext", createMockAudioContext("suspended"))

    const onError = vi.fn()
    const analyzer = new AudioAnalyzer(onError)

    await analyzer.initialize()

    expect(mockAudioContextResume).toHaveBeenCalled()

    analyzer.cleanup()
  })

  it("cleanup() releases all resources", async () => {
    const onError = vi.fn()
    const analyzer = new AudioAnalyzer(onError)

    await analyzer.initialize()
    analyzer.cleanup()

    expect(mockTrackStop).toHaveBeenCalled()
    expect(mockAudioContextClose).toHaveBeenCalled()
    // After cleanup, getAudioData should return null
    expect(analyzer.getAudioData()).toBeNull()
  })

  it("does not request microphone again if stream already exists", async () => {
    const onError = vi.fn()
    const analyzer = new AudioAnalyzer(onError)

    await analyzer.initialize()
    expect(mockGetUserMedia).toHaveBeenCalledTimes(1)

    // Reset the initialized state to allow re-initialization without cleanup
    // In practice, initialize() checks if stream already exists
    await analyzer.initialize()
    // getUserMedia should not be called again because stream is cached
    expect(mockGetUserMedia).toHaveBeenCalledTimes(1)

    analyzer.cleanup()
  })

  it("resume() does nothing if AudioContext is already running", async () => {
    const onError = vi.fn()
    const analyzer = new AudioAnalyzer(onError)
    await analyzer.initialize()

    // AudioContext state is "running"
    await analyzer.resume()
    // resume should not be called since state is "running"
    // (resume was called during initialize if suspended, but not during resume() call)
    expect(mockAudioContextResume).toHaveBeenCalledTimes(0)

    analyzer.cleanup()
  })
})

// ----------------------------------------------------------------
// NoteDetector unit tests
// ----------------------------------------------------------------

import { NoteDetector } from "@/utils/note-detector"
import { DEFAULT_A4_FREQ } from "@/utils/note-utils"

describe("NoteDetector", () => {
  it("returns null for invalid frequency", () => {
    const detector = new NoteDetector()
    expect(detector.detectNote(0, DEFAULT_A4_FREQ, false)).toBeNull()
    expect(detector.detectNote(-1, DEFAULT_A4_FREQ, false)).toBeNull()
  })

  it("detects A4 at 440Hz after enough consistent readings", () => {
    const detector = new NoteDetector()
    let result = null

    // Feed consistent A4 readings until note is confirmed
    for (let i = 0; i < 15; i++) {
      result = detector.detectNote(440, DEFAULT_A4_FREQ, false)
    }

    expect(result).not.toBeNull()
    expect(result!.noteName).toBe("A")
    expect(result!.octave).toBe(4)
    expect(result!.tuningStatus).toBe("in-tune")
  })

  it("uses flat notation when useFlats is true", () => {
    const detector = new NoteDetector()
    let result = null

    // Bb4 = ~466.16Hz
    for (let i = 0; i < 15; i++) {
      result = detector.detectNote(466.16, DEFAULT_A4_FREQ, true)
    }

    expect(result).not.toBeNull()
    expect(result!.noteName).toBe("Bb")
  })

  it("uses sharp notation when useFlats is false", () => {
    const detector = new NoteDetector()
    let result = null

    // A#4 = ~466.16Hz
    for (let i = 0; i < 15; i++) {
      result = detector.detectNote(466.16, DEFAULT_A4_FREQ, false)
    }

    expect(result).not.toBeNull()
    expect(result!.noteName).toBe("A#")
  })

  it("reset() clears all state", () => {
    const detector = new NoteDetector()

    // Build up state
    for (let i = 0; i < 15; i++) {
      detector.detectNote(440, DEFAULT_A4_FREQ, false)
    }

    detector.reset()

    // After reset, first readings should return null (hysteresis threshold not met)
    expect(detector.detectNote(440, DEFAULT_A4_FREQ, false)).toBeNull()
    expect(detector.getBufferFillRatio()).toBeLessThan(1)
  })
})

// ----------------------------------------------------------------
// Audio processing utility tests
// ----------------------------------------------------------------

import {
  getRMS,
  getMedianFrequency,
  isFrequencyConsistent,
  centsFromFrequencies,
  correctOctaveError,
} from "@/utils/audio-processing"

describe("getRMS", () => {
  it("returns 0 for silent buffer", () => {
    const buffer = new Float32Array(1024)
    expect(getRMS(buffer)).toBe(0)
  })

  it("calculates correct RMS for known signal", () => {
    const buffer = new Float32Array(4)
    buffer[0] = 1
    buffer[1] = -1
    buffer[2] = 1
    buffer[3] = -1
    expect(getRMS(buffer)).toBe(1)
  })
})

describe("getMedianFrequency", () => {
  it("returns 0 for empty array", () => {
    expect(getMedianFrequency([])).toBe(0)
  })

  it("returns single value for one-element array", () => {
    expect(getMedianFrequency([440])).toBe(440)
  })

  it("returns median for odd-length array", () => {
    expect(getMedianFrequency([100, 440, 200])).toBe(200)
  })

  it("returns average of middle two for even-length array", () => {
    expect(getMedianFrequency([100, 200, 300, 400])).toBe(250)
  })
})

describe("isFrequencyConsistent", () => {
  it("returns true with fewer than 2 recent readings", () => {
    expect(isFrequencyConsistent(440, [])).toBe(true)
    expect(isFrequencyConsistent(440, [440])).toBe(true)
  })

  it("returns true for consistent frequency", () => {
    expect(isFrequencyConsistent(442, [440, 441, 439])).toBe(true)
  })

  it("returns false for wildly different frequency", () => {
    expect(isFrequencyConsistent(880, [440, 441, 439])).toBe(false)
  })
})

describe("centsFromFrequencies", () => {
  it("returns 0 for identical frequencies", () => {
    expect(centsFromFrequencies(440, 440)).toBe(0)
  })

  it("returns ~100 cents for a semitone up", () => {
    const result = centsFromFrequencies(466.16, 440)
    expect(result).toBeGreaterThanOrEqual(99)
    expect(result).toBeLessThanOrEqual(101)
  })
})

describe("correctOctaveError", () => {
  it("returns original frequency with fewer than 3 recent readings", () => {
    expect(correctOctaveError(880, [440, 441])).toBe(880)
  })

  it("corrects octave-up error", () => {
    const result = correctOctaveError(880, [440, 441, 439])
    expect(result).toBe(440)
  })

  it("corrects octave-down error", () => {
    const result = correctOctaveError(220, [440, 441, 439])
    expect(result).toBe(440)
  })

  it("does not correct non-octave frequency", () => {
    expect(correctOctaveError(660, [440, 441, 439])).toBe(660)
  })
})
