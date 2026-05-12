import { describe, expect, it, vi, beforeEach, afterEach } from "vitest"
import { renderHook, act, waitFor } from "@testing-library/react"

// ----------------------------------------------------------------
// Mock browser APIs that don't exist in jsdom (mirrors use-tuner.test.ts
// setup; kept local so the two suites can be run independently).
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
}

const createMockAudioContext = (options: MockOptions = {}) => {
  return class MockAudioContext {
    state: string
    sampleRate = 44100
    resume = mockAudioContextResume
    close = mockAudioContextClose
    constructor() {
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

// Capture original descriptors so afterEach can fully restore globals.
// Without this, vi.stubGlobal + Object.defineProperty mutations would leak
// across tests (and potentially across test files when the suite is split).
let origIsSecureContextDesc: PropertyDescriptor | undefined
let origMediaDevicesDesc: PropertyDescriptor | undefined

beforeEach(() => {
  vi.clearAllMocks()

  vi.stubGlobal("AudioContext", createMockAudioContext())

  origIsSecureContextDesc = Object.getOwnPropertyDescriptor(window, "isSecureContext")
  Object.defineProperty(window, "isSecureContext", {
    value: true,
    writable: true,
    configurable: true,
  })

  origMediaDevicesDesc = Object.getOwnPropertyDescriptor(navigator, "mediaDevices")
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
  vi.unstubAllGlobals()

  // Restore the original descriptor when one existed; otherwise delete the
  // property we injected so we don't leak test-added own properties between
  // tests (or, in theory, across files when the suite is split).
  if (origIsSecureContextDesc) {
    Object.defineProperty(window, "isSecureContext", origIsSecureContextDesc)
  } else {
    delete (window as { isSecureContext?: boolean }).isSecureContext
  }
  if (origMediaDevicesDesc) {
    Object.defineProperty(navigator, "mediaDevices", origMediaDevicesDesc)
  } else {
    delete (navigator as { mediaDevices?: MediaDevices }).mediaDevices
  }
})

// ----------------------------------------------------------------
// useTuner orchestration tests
// ----------------------------------------------------------------

import { useTuner } from "@/hooks/use-tuner"

describe("useTuner", () => {
  it("transitions from isInitializing to ready on successful mount", async () => {
    const { result, unmount } = renderHook(() => useTuner())

    // Initial render: mount effect hasn't resolved yet
    expect(result.current[0].isInitializing).toBe(true)
    expect(result.current[0].error).toBeNull()
    expect(result.current[0].needsUserGesture).toBe(false)

    await waitFor(() => {
      expect(result.current[0].isInitializing).toBe(false)
    })

    expect(result.current[0].error).toBeNull()
    expect(result.current[0].needsUserGesture).toBe(false)
    expect(mockGetUserMedia).toHaveBeenCalled()

    unmount()
  })

  it("surfaces needsUserGesture when AudioContext stays suspended (iOS Safari path)", async () => {
    vi.stubGlobal("AudioContext", createMockAudioContext({ state: "suspended" }))

    const { result, unmount } = renderHook(() => useTuner())

    await waitFor(() => {
      expect(result.current[0].isInitializing).toBe(false)
    })

    expect(result.current[0].needsUserGesture).toBe(true)
    expect(result.current[0].error).toBeNull()

    unmount()
  })

  it("startWithGesture clears needsUserGesture when resume succeeds", async () => {
    // Mimic iOS Safari: resume() outside a user gesture resolves but leaves
    // state="suspended"; resume() inside a gesture actually transitions to
    // "running". We approximate that by flipping state only on the 2nd call.
    let currentState = "suspended"
    let resumeCalls = 0
    class iOSLikeContext {
      get state() {
        return currentState
      }
      sampleRate = 44100
      resume = vi.fn().mockImplementation(async () => {
        resumeCalls++
        if (resumeCalls >= 2) currentState = "running"
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
    vi.stubGlobal("AudioContext", iOSLikeContext)

    const { result, unmount } = renderHook(() => useTuner())

    await waitFor(() => {
      expect(result.current[0].needsUserGesture).toBe(true)
    })

    await act(async () => {
      await result.current[1].startWithGesture()
    })

    expect(result.current[0].needsUserGesture).toBe(false)

    unmount()
  })

  it("surfaces a permission error to state and exposes retry()", async () => {
    mockGetUserMedia.mockRejectedValueOnce(new DOMException("Denied", "NotAllowedError"))

    const { result, unmount } = renderHook(() => useTuner())

    await waitFor(() => {
      expect(result.current[0].error).toMatch(/access denied/i)
    })

    expect(result.current[0].isInitializing).toBe(false)
    expect(result.current[0].needsUserGesture).toBe(false)

    unmount()
  })

  it("retry() clears the error and re-attempts initialisation", async () => {
    mockGetUserMedia.mockRejectedValueOnce(new DOMException("Denied", "NotAllowedError"))

    const { result, unmount } = renderHook(() => useTuner())

    await waitFor(() => {
      expect(result.current[0].error).toMatch(/access denied/i)
    })

    // User changes browser permission; retry succeeds.
    mockGetUserMedia.mockResolvedValueOnce(mockStream)

    await act(async () => {
      await result.current[1].retry()
    })

    // Wrap in waitFor — retry() awaits stopTuner() + initialise(), and the
    // setIsInitializing(false) call lands on a later microtask via act's flush.
    await waitFor(() => {
      expect(result.current[0].error).toBeNull()
      expect(result.current[0].isInitializing).toBe(false)
    })
    // Both attempts should have called getUserMedia (the second is the retry).
    expect(mockGetUserMedia).toHaveBeenCalledTimes(2)

    unmount()
  })

  it("settings actions update state without re-initialising the analyzer", async () => {
    const { result, unmount } = renderHook(() => useTuner())

    await waitFor(() => {
      expect(result.current[0].isInitializing).toBe(false)
    })

    const callsBefore = mockGetUserMedia.mock.calls.length

    act(() => {
      result.current[1].toggleNotation()
    })
    expect(result.current[0].useFlats).toBe(true)

    act(() => {
      result.current[1].toggleOctaveDisplay()
    })
    expect(result.current[0].showOctave).toBe(true)

    act(() => {
      result.current[1].adjustReferenceFreq(0.5)
    })
    expect(result.current[0].referenceFreq).toBe(440.5)

    act(() => {
      result.current[1].resetReferenceFreq()
    })
    expect(result.current[0].referenceFreq).toBe(440.0)

    // No new mic re-requests fired by any of the settings actions.
    expect(mockGetUserMedia.mock.calls.length).toBe(callsBefore)

    unmount()
  })

  it("unmount stops the underlying media-stream tracks", async () => {
    const { result, unmount } = renderHook(() => useTuner())

    await waitFor(() => {
      expect(result.current[0].isInitializing).toBe(false)
    })

    expect(mockTrackStop).not.toHaveBeenCalled()

    unmount()

    // Cleanup is fire-and-forget on unmount but resolves quickly with mocked close().
    await waitFor(() => {
      expect(mockTrackStop).toHaveBeenCalled()
    })
  })
})
