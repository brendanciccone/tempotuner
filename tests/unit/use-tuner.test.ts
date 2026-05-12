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

interface MockOptions {
  state?: string
  /** Throw on `new MockAudioContext({ sampleRate })` to simulate sample-rate rejection. */
  rejectSampleRate?: boolean
}

const createMockAudioContext = (options: MockOptions = {}) => {
  return class MockAudioContext {
    state: string
    sampleRate = 44100
    resume = mockAudioContextResume
    close = mockAudioContextClose
    constructor(opts?: AudioContextOptions) {
      if (options.rejectSampleRate && opts && "sampleRate" in opts) {
        throw new DOMException("Sample rate not supported", "NotSupportedError")
      }
      this.state = options.state ?? "running"
    }
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

  vi.stubGlobal("AudioContext", createMockAudioContext())

  // jsdom: window.isSecureContext is true by default; make it explicit.
  Object.defineProperty(window, "isSecureContext", {
    value: true,
    writable: true,
    configurable: true,
  })

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
  it("requests microphone permissions and returns 'success' on initialize()", async () => {
    const onError = vi.fn()
    const analyzer = new AudioAnalyzer(onError)

    const result = await analyzer.initialize()

    expect(result).toBe("success")
    expect(mockGetUserMedia).toHaveBeenCalledWith({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    })
    expect(onError).not.toHaveBeenCalled()

    await analyzer.cleanup()
  })

  it("returns 'error' and reports a permission-denied message on NotAllowedError", async () => {
    mockGetUserMedia.mockRejectedValueOnce(new DOMException("Denied", "NotAllowedError"))

    const onError = vi.fn()
    const analyzer = new AudioAnalyzer(onError)

    const result = await analyzer.initialize()

    expect(result).toBe("error")
    expect(onError).toHaveBeenCalledWith(expect.stringMatching(/access denied/i))
  })

  it("reports a 'no microphone found' message on NotFoundError", async () => {
    mockGetUserMedia.mockRejectedValueOnce(new DOMException("No mic", "NotFoundError"))

    const onError = vi.fn()
    const analyzer = new AudioAnalyzer(onError)

    const result = await analyzer.initialize()

    expect(result).toBe("error")
    expect(onError).toHaveBeenCalledWith(expect.stringMatching(/no microphone/i))
  })

  it("reports a 'mic in use' message on NotReadableError", async () => {
    mockGetUserMedia.mockRejectedValueOnce(new DOMException("Busy", "NotReadableError"))

    const onError = vi.fn()
    const analyzer = new AudioAnalyzer(onError)

    const result = await analyzer.initialize()

    expect(result).toBe("error")
    expect(onError).toHaveBeenCalledWith(expect.stringMatching(/in use/i))
  })

  it("reports a 'constraints unsupported' message on OverconstrainedError", async () => {
    mockGetUserMedia.mockRejectedValueOnce(
      new DOMException("Bad constraints", "OverconstrainedError")
    )

    const onError = vi.fn()
    const analyzer = new AudioAnalyzer(onError)

    const result = await analyzer.initialize()

    expect(result).toBe("error")
    expect(onError).toHaveBeenCalledWith(expect.stringMatching(/settings/i))
  })

  it("detects insecure context before requesting microphone", async () => {
    Object.defineProperty(window, "isSecureContext", {
      value: false,
      writable: true,
      configurable: true,
    })

    const onError = vi.fn()
    const analyzer = new AudioAnalyzer(onError)

    const result = await analyzer.initialize()

    expect(result).toBe("error")
    expect(mockGetUserMedia).not.toHaveBeenCalled()
    expect(onError).toHaveBeenCalledWith(expect.stringMatching(/secure connection|HTTPS/i))
  })

  it("detects missing mediaDevices and reports unsupported browser", async () => {
    Object.defineProperty(navigator, "mediaDevices", {
      value: undefined,
      writable: true,
      configurable: true,
    })

    const onError = vi.fn()
    const analyzer = new AudioAnalyzer(onError)

    const result = await analyzer.initialize()

    expect(result).toBe("error")
    expect(onError).toHaveBeenCalledWith(expect.stringMatching(/doesn't support/i))
  })

  it("handles missing AudioContext gracefully", async () => {
    vi.stubGlobal("AudioContext", undefined)
    vi.stubGlobal("webkitAudioContext", undefined)

    const onError = vi.fn()
    const analyzer = new AudioAnalyzer(onError)

    const result = await analyzer.initialize()

    expect(result).toBe("error")
    expect(onError).toHaveBeenCalledWith(expect.stringMatching(/web audio is not available/i))
  })

  it("falls back to default sample rate when 44100 is rejected", async () => {
    let attempts = 0
    class FallbackAudioContext {
      state = "running"
      sampleRate = 48000
      resume = mockAudioContextResume
      close = mockAudioContextClose
      constructor(opts?: AudioContextOptions) {
        attempts++
        if (opts && "sampleRate" in opts) {
          throw new DOMException("Sample rate not supported", "NotSupportedError")
        }
      }
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
    vi.stubGlobal("AudioContext", FallbackAudioContext)

    const onError = vi.fn()
    const analyzer = new AudioAnalyzer(onError)

    const result = await analyzer.initialize()

    expect(result).toBe("success")
    expect(attempts).toBe(2) // first (rejected) + fallback (succeeded)
    expect(analyzer.getSampleRate()).toBe(48000)
    expect(onError).not.toHaveBeenCalled()

    await analyzer.cleanup()
  })

  it("returns 'needs-gesture' when the AudioContext stays suspended after resume()", async () => {
    // Simulate iOS Safari: resume() resolves but state remains "suspended"
    vi.stubGlobal("AudioContext", createMockAudioContext({ state: "suspended" }))

    const onError = vi.fn()
    const analyzer = new AudioAnalyzer(onError)

    const result = await analyzer.initialize()

    expect(result).toBe("needs-gesture")
    expect(mockAudioContextResume).toHaveBeenCalled()
    expect(analyzer.isSuspended()).toBe(true)

    await analyzer.cleanup()
  })

  it("resumes a suspended AudioContext during initialize()", async () => {
    vi.stubGlobal("AudioContext", createMockAudioContext({ state: "suspended" }))

    const onError = vi.fn()
    const analyzer = new AudioAnalyzer(onError)

    await analyzer.initialize()

    expect(mockAudioContextResume).toHaveBeenCalled()

    await analyzer.cleanup()
  })

  it("cleanup() releases all resources", async () => {
    const onError = vi.fn()
    const analyzer = new AudioAnalyzer(onError)

    await analyzer.initialize()
    await analyzer.cleanup()

    expect(mockTrackStop).toHaveBeenCalled()
    expect(mockAudioContextClose).toHaveBeenCalled()
    expect(analyzer.getAudioData()).toBeNull()
  })

  it("does not request microphone again if stream already exists", async () => {
    const onError = vi.fn()
    const analyzer = new AudioAnalyzer(onError)

    await analyzer.initialize()
    expect(mockGetUserMedia).toHaveBeenCalledTimes(1)

    await analyzer.initialize()
    expect(mockGetUserMedia).toHaveBeenCalledTimes(1)

    await analyzer.cleanup()
  })

  it("resume() does nothing if AudioContext is already running", async () => {
    const onError = vi.fn()
    const analyzer = new AudioAnalyzer(onError)
    await analyzer.initialize()

    const running = await analyzer.resume()
    expect(running).toBe(true)
    expect(mockAudioContextResume).toHaveBeenCalledTimes(0)

    await analyzer.cleanup()
  })

  it("resume() returns true when context transitions from suspended to running", async () => {
    // Custom mock where resume() flips state to "running"
    const dynamicContext = (() => {
      let currentState = "suspended"
      return class {
        get state() {
          return currentState
        }
        sampleRate = 44100
        resume = vi.fn().mockImplementation(async () => {
          currentState = "running"
        })
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
    })()
    vi.stubGlobal("AudioContext", dynamicContext)

    const onError = vi.fn()
    const analyzer = new AudioAnalyzer(onError)
    const initResult = await analyzer.initialize()

    expect(initResult).toBe("success")
    expect(analyzer.isSuspended()).toBe(false)

    await analyzer.cleanup()
  })

  it("falls back to webkitAudioContext when window.AudioContext is missing", async () => {
    vi.stubGlobal("AudioContext", undefined)
    vi.stubGlobal("webkitAudioContext", createMockAudioContext())

    const onError = vi.fn()
    const analyzer = new AudioAnalyzer(onError)

    const result = await analyzer.initialize()

    expect(result).toBe("success")
    expect(onError).not.toHaveBeenCalled()

    await analyzer.cleanup()
  })

  it("can be re-initialized after cleanup() (the underlying retry mechanism)", async () => {
    const onError = vi.fn()
    const analyzer = new AudioAnalyzer(onError)

    // First attempt: deny permission
    mockGetUserMedia.mockRejectedValueOnce(new DOMException("Denied", "NotAllowedError"))
    const first = await analyzer.initialize()
    expect(first).toBe("error")
    expect(onError).toHaveBeenCalledTimes(1)

    // User changes browser permission, app calls retry → cleanup() + initialize()
    await analyzer.cleanup()
    onError.mockClear()

    // Second attempt: succeeds
    mockGetUserMedia.mockResolvedValueOnce(mockStream)
    const second = await analyzer.initialize()

    expect(second).toBe("success")
    expect(mockGetUserMedia).toHaveBeenCalledTimes(2)
    expect(onError).not.toHaveBeenCalled()

    await analyzer.cleanup()
  })

  it("resume() returns false when called before initialize()", async () => {
    const onError = vi.fn()
    const analyzer = new AudioAnalyzer(onError)

    const running = await analyzer.resume()
    expect(running).toBe(false)
    expect(analyzer.isSuspended()).toBe(false)
  })

  it("cleanup() does not resolve until AudioContext.close() resolves", async () => {
    // Regression guard: the Web Audio spec only releases creation-blocking
    // resources after close()'s Promise resolves. If a future refactor drops
    // the `await` inside cleanup(), the retry flow could race a new
    // AudioContext creation against the pending close. Mock close() with a
    // deferred promise so we can observe that cleanup() actually waits.
    let resolveClose: (() => void) | undefined
    const deferredClose = vi.fn().mockImplementation(
      () => new Promise<void>((resolve) => {
        resolveClose = resolve
      })
    )

    class DeferredCloseContext {
      state = "running"
      sampleRate = 44100
      resume = mockAudioContextResume
      close = deferredClose
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
    vi.stubGlobal("AudioContext", DeferredCloseContext)

    const analyzer = new AudioAnalyzer(vi.fn())
    await analyzer.initialize()

    let cleanupDone = false
    const cleanupPromise = analyzer.cleanup().then(() => {
      cleanupDone = true
    })

    // Flush microtasks so any non-awaiting cleanup would have settled by now.
    await Promise.resolve()
    await Promise.resolve()
    expect(cleanupDone).toBe(false)
    expect(deferredClose).toHaveBeenCalled()

    // Release close() and confirm cleanup() now settles.
    resolveClose?.()
    await cleanupPromise
    expect(cleanupDone).toBe(true)
  })

  it("isSuspended() reflects the current AudioContext state", async () => {
    vi.stubGlobal("AudioContext", createMockAudioContext({ state: "suspended" }))

    const onError = vi.fn()
    const analyzer = new AudioAnalyzer(onError)
    await analyzer.initialize()

    expect(analyzer.isSuspended()).toBe(true)

    await analyzer.cleanup()
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

    for (let i = 0; i < 15; i++) {
      result = detector.detectNote(466.16, DEFAULT_A4_FREQ, true)
    }

    expect(result).not.toBeNull()
    expect(result!.noteName).toBe("Bb")
  })

  it("uses sharp notation when useFlats is false", () => {
    const detector = new NoteDetector()
    let result = null

    for (let i = 0; i < 15; i++) {
      result = detector.detectNote(466.16, DEFAULT_A4_FREQ, false)
    }

    expect(result).not.toBeNull()
    expect(result!.noteName).toBe("A#")
  })

  it("reset() clears all state", () => {
    const detector = new NoteDetector()

    for (let i = 0; i < 15; i++) {
      detector.detectNote(440, DEFAULT_A4_FREQ, false)
    }

    detector.reset()

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
