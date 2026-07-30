import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import TapTempo from "@/components/tap-tempo"

// ----------------------------------------------------------------
// The metronome child reaches for Web Audio on mount teardown; jsdom has no
// AudioContext, and none of these tests start playback.
// ----------------------------------------------------------------

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: false })
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const getBpm = (): string => {
  const readout = screen.getByText("Beats Per Minute").parentElement
  if (!readout) throw new Error("BPM readout not found")
  const value = readout.querySelector(".tabular-nums")
  if (!value) throw new Error("BPM value not found")
  return value.textContent ?? ""
}

/** Four presses 500ms apart is 120 BPM — if each press counts exactly once. */
const pressFourTimes = (fire: () => void) => {
  for (let i = 0; i < 4; i++) {
    fire()
    if (i < 3) vi.advanceTimersByTime(500)
  }
}

describe("tap tempo keyboard input", () => {
  it("counts one tap per key press when the pad has focus", () => {
    // Regression: the pad carried its own onKeyDown while a window-level
    // listener was already tapping on every key, so one Enter counted twice.
    // The zero-length interval between the pair halved the average and roughly
    // doubled the reported tempo (measured 268 BPM for a 120 BPM input).
    render(<TapTempo />)
    const pad = screen.getByRole("button", { name: /tap to set tempo/i })
    pad.focus()

    pressFourTimes(() => fireEvent.keyDown(pad, { key: "Enter", code: "Enter" }))

    expect(getBpm()).toBe("120")
  })

  it("counts one tap per key press from anywhere on the page", () => {
    // Tapping tempo with any key is the intended behaviour and has to survive
    // the fix above, which removed the pad's own handler.
    render(<TapTempo />)

    pressFourTimes(() => fireEvent.keyDown(document.body, { key: "q", code: "KeyQ" }))

    expect(getBpm()).toBe("120")
  })

  it("counts one tap per pointer press", () => {
    render(<TapTempo />)
    const pad = screen.getByRole("button", { name: /tap to set tempo/i })

    pressFourTimes(() => fireEvent.click(pad))

    expect(getBpm()).toBe("120")
  })

  it("restarts the average when taps are more than two seconds apart", () => {
    render(<TapTempo />)
    const pad = screen.getByRole("button", { name: /tap to set tempo/i })

    fireEvent.click(pad)
    vi.advanceTimersByTime(500)
    fireEvent.click(pad)
    expect(getBpm()).toBe("120")

    // A gap this long means the player stopped; the old interval is stale.
    vi.advanceTimersByTime(2500)
    fireEvent.click(pad)

    expect(getBpm()).toBe("---")
  })
})
