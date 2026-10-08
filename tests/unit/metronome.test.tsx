import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { Metronome } from "@/components/metronome"
import { clickVoiceForAccent } from "@/utils/metronome-timing"

// ----------------------------------------------------------------
// A Web Audio stand-in with a clock the test drives by hand. jsdom has no
// AudioContext, and the behaviour under test — how many contexts exist, when
// they are resumed, suspended and closed, and which voice each click gets — is
// all in the calls made against it.
// ----------------------------------------------------------------

class MockOscillator {
  type: OscillatorType = "sine"
  frequency = { value: 0 }
  onended: (() => void) | null = null
  connect = vi.fn()
  disconnect = vi.fn()
  start = vi.fn()
  stop = vi.fn()
}

class MockAudioContext {
  static instances: MockAudioContext[] = []
  static startState: AudioContextState = "suspended"
  static resumeError: DOMException | null = null

  state: AudioContextState = MockAudioContext.startState
  currentTime = 0
  destination = {}
  oscillators: MockOscillator[] = []
  options: AudioContextOptions | undefined

  // State changes land asynchronously, as they do in Firefox and Safari: the
  // `state` attribute keeps its old value until the queued operation runs.
  resume = vi.fn(() => {
    if (MockAudioContext.resumeError) return Promise.reject(MockAudioContext.resumeError)
    return Promise.resolve().then(() => {
      this.state = "running"
    })
  })
  suspend = vi.fn(() =>
    Promise.resolve().then(() => {
      this.state = "suspended"
    }),
  )
  close = vi.fn(() => {
    this.state = "closed"
    return Promise.resolve()
  })

  constructor(options?: AudioContextOptions) {
    this.options = options
    MockAudioContext.instances.push(this)
  }

  createOscillator = () => {
    const osc = new MockOscillator()
    this.oscillators.push(osc)
    return osc
  }

  createGain = () => ({
    gain: { value: 0, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() },
    connect: vi.fn(),
    disconnect: vi.fn(),
  })
}

let audioSessionDesc: PropertyDescriptor | undefined

beforeEach(() => {
  vi.useFakeTimers()
  MockAudioContext.instances = []
  MockAudioContext.startState = "suspended"
  MockAudioContext.resumeError = null
  vi.stubGlobal("AudioContext", MockAudioContext)
  audioSessionDesc = Object.getOwnPropertyDescriptor(navigator, "audioSession")
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  if (audioSessionDesc) {
    Object.defineProperty(navigator, "audioSession", audioSessionDesc)
  } else {
    delete (navigator as { audioSession?: unknown }).audioSession
  }
})

const renderMetronome = (bpm = 120) => {
  const onBpmChange = vi.fn()
  const utils = render(<Metronome bpm={bpm} onBpmChange={onBpmChange} />)
  return { ...utils, onBpmChange }
}

const toggle = () => fireEvent.click(screen.getByRole("button", { name: /metronome/i }))

/** Move the audio clock forward and let the scheduler's timer chain run. */
const advanceClock = (context: MockAudioContext, seconds: number) => {
  act(() => {
    context.currentTime += seconds
    vi.advanceTimersByTime(seconds * 1000)
  })
}

const onlyContext = (): MockAudioContext => {
  expect(MockAudioContext.instances).toHaveLength(1)
  return MockAudioContext.instances[0]
}

// ----------------------------------------------------------------
// AudioContext lifecycle
// ----------------------------------------------------------------

describe("metronome audio lifecycle", () => {
  it("creates nothing until the metronome is started", () => {
    renderMetronome()
    expect(MockAudioContext.instances).toHaveLength(0)
  })

  it("reuses one AudioContext across stop and start", () => {
    // Regression: the first start created a context, closed it, and created a
    // second; every later start closed and recreated it again. Browsers cap
    // live contexts and close() is asynchronous, so rapid toggling stacked
    // them up.
    renderMetronome()

    toggle()
    toggle()
    toggle()
    toggle()
    toggle()

    const context = onlyContext()
    expect(context.close).not.toHaveBeenCalled()
  })

  it("resumes the context synchronously inside the click", () => {
    // Safari only lets audio start from within a user gesture, so resume()
    // must be called before the click handler returns, not after an await.
    renderMetronome()
    toggle()

    expect(onlyContext().resume).toHaveBeenCalledTimes(1)
  })

  it("resumes on every start, even when the context still reports running", async () => {
    // Regression: start skipped resume() whenever state read "running". In
    // Firefox and Safari a stop's suspend() leaves state at "running" until it
    // lands, so a quick stop-then-start skipped the resume, the suspend landed
    // afterwards, and the panel showed Running with no sound.
    MockAudioContext.startState = "running"
    renderMetronome()

    toggle()
    toggle()
    toggle()
    const context = onlyContext()
    await act(async () => {
      await Promise.resolve()
    })

    expect(context.resume).toHaveBeenCalledTimes(2)
    expect(context.state).toBe("running")
  })

  it("suspends the context on stop and resumes it on the next start", () => {
    renderMetronome()
    toggle()
    const context = onlyContext()

    toggle()
    expect(context.suspend).toHaveBeenCalledTimes(1)

    toggle()
    expect(context.resume).toHaveBeenCalledTimes(2)
  })

  it("closes the context on unmount", () => {
    const { unmount } = renderMetronome()
    toggle()
    const context = onlyContext()

    unmount()

    expect(context.close).toHaveBeenCalledTimes(1)
  })

  it("asks for a low-latency context", () => {
    renderMetronome()
    toggle()

    expect(onlyContext().options).toEqual({ latencyHint: "interactive" })
  })
})

// ----------------------------------------------------------------
// Failure paths
// ----------------------------------------------------------------

describe("metronome without Web Audio", () => {
  it("reports a fault instead of crashing when AudioContext is missing", () => {
    // Regression: start dereferenced the context with a non-null assertion, so
    // a browser without Web Audio threw from the click handler.
    vi.stubGlobal("AudioContext", undefined)
    vi.stubGlobal("webkitAudioContext", undefined)
    renderMetronome()

    toggle()

    expect(screen.getByRole("alert")).toHaveTextContent(/audio output is not available/i)
    expect(screen.getByRole("button", { name: /metronome/i })).toHaveAttribute("aria-pressed", "false")
  })

  it("reports a fault when the AudioContext constructor throws", () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    class ThrowingAudioContext {
      constructor() {
        throw new DOMException("No output device", "NotSupportedError")
      }
    }
    vi.stubGlobal("AudioContext", ThrowingAudioContext)
    renderMetronome()

    toggle()

    expect(screen.getByRole("alert")).toHaveTextContent(/audio output is not available/i)
    expect(screen.getByRole("button", { name: /metronome/i })).toHaveAttribute("aria-pressed", "false")
  })

  it("stops and reports a fault when resume() is rejected", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    MockAudioContext.resumeError = new DOMException("blocked", "NotAllowedError")
    renderMetronome()

    await act(async () => {
      toggle()
    })

    expect(screen.getByRole("alert")).toHaveTextContent(/couldn't start audio/i)
    expect(screen.getByRole("button", { name: /metronome/i })).toHaveAttribute("aria-pressed", "false")
  })
})

// ----------------------------------------------------------------
// Scheduling
// ----------------------------------------------------------------

describe("metronome scheduling", () => {
  it("schedules the first click 100ms after start, as the downbeat voice", () => {
    renderMetronome(120)
    toggle()
    const context = onlyContext()

    advanceClock(context, 0.05)

    expect(context.oscillators).toHaveLength(1)
    const [first] = context.oscillators
    expect(first.start).toHaveBeenCalledWith(0.1)
    expect(first.frequency.value).toBe(clickVoiceForAccent("primary").frequency)
  })

  it("spaces clicks by the tempo and accents only the downbeat in 4/4", () => {
    renderMetronome(120)
    toggle()
    const context = onlyContext()

    // 0.1, 0.6, 1.1, 1.6, 2.1 — five clicks inside 2.05s plus the 100ms lookahead.
    for (let i = 0; i < 41; i++) advanceClock(context, 0.05)

    const startTimes = context.oscillators.map((osc) => osc.start.mock.calls[0][0] as number)
    expect(startTimes.map((t) => Number(t.toFixed(3)))).toEqual([0.1, 0.6, 1.1, 1.6, 2.1])
    const frequencies = context.oscillators.map((osc) => osc.frequency.value)
    const primary = clickVoiceForAccent("primary").frequency
    const regular = clickVoiceForAccent("regular").frequency
    expect(frequencies).toEqual([primary, regular, regular, regular, primary])
  })

  it("picks up a tempo change while running", () => {
    const onBpmChange = vi.fn()
    const { rerender } = render(<Metronome bpm={120} onBpmChange={onBpmChange} />)
    toggle()
    const context = onlyContext()
    advanceClock(context, 0.05) // first click at 0.1

    rerender(<Metronome bpm={60} onBpmChange={onBpmChange} />)
    for (let i = 0; i < 30; i++) advanceClock(context, 0.05)

    const startTimes = context.oscillators.map((osc) => Number((osc.start.mock.calls[0][0] as number).toFixed(3)))
    // 0.1 then 0.6 (already committed at 120 BPM), then one second apart.
    expect(startTimes.slice(0, 3)).toEqual([0.1, 0.6, 1.6])
  })

  it("plays an out-of-range tap tempo at the nearest playable tempo", () => {
    renderMetronome(300)
    toggle()
    const context = onlyContext()

    for (let i = 0; i < 10; i++) advanceClock(context, 0.05)

    const [first, second] = context.oscillators.map((osc) => osc.start.mock.calls[0][0] as number)
    expect(second - first).toBeCloseTo(60 / 240, 6)
  })

  it("stops every scheduled click on stop", () => {
    renderMetronome(120)
    toggle()
    const context = onlyContext()
    advanceClock(context, 0.05)

    toggle()

    // Every click was given a scheduled stop when it was queued; stop has to
    // add an immediate one, or queued clicks still sound after a restart.
    context.oscillators.forEach((osc) => expect(osc.stop).toHaveBeenLastCalledWith())
    const before = context.oscillators.length
    advanceClock(context, 2)
    expect(context.oscillators).toHaveLength(before)
  })

  it("queues further ahead while the tab is hidden", () => {
    // Hidden tabs can have their timers throttled to about once a second, so
    // a 100ms queue would run dry between scheduler passes.
    const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(true)
    renderMetronome(120)
    toggle()
    const context = onlyContext()

    advanceClock(context, 0.02)

    // Every click due inside the next 1.5s is already committed.
    expect(context.oscillators.length).toBeGreaterThanOrEqual(3)
    hidden.mockRestore()
  })
})

// ----------------------------------------------------------------
// iOS audio session
// ----------------------------------------------------------------

describe("metronome audio session", () => {
  it("declares media playback while running and releases it on stop and unmount", () => {
    // Safari plays Web Audio in the "ambient" category, which the iPhone's
    // silent switch mutes; "playback" is how a page says it is media.
    const session = { type: "auto" }
    Object.defineProperty(navigator, "audioSession", { value: session, configurable: true })

    const { unmount } = renderMetronome()
    toggle()
    expect(session.type).toBe("playback")

    toggle()
    expect(session.type).toBe("auto")

    toggle()
    unmount()
    expect(session.type).toBe("auto")
  })

  it("does nothing in browsers without the Audio Session API", () => {
    delete (navigator as { audioSession?: unknown }).audioSession
    renderMetronome()

    expect(() => toggle()).not.toThrow()
  })
})
