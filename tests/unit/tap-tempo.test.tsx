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
  it("counts one tap per keyboard activation of the pad", () => {
    // Regression: the pad handled Enter itself while a window-level listener was
    // also tapping on every key, so one press counted twice. The zero-length
    // interval between the pair halved the average and read 346 BPM for a
    // 120 BPM input.
    //
    // A real browser turns Enter on a focused button into keydown FOLLOWED BY a
    // click, and fireEvent.keyDown alone only reproduces the first half — which
    // would pass whether or not the click path double-counts. Both halves are
    // dispatched here so the assertion covers the whole activation.
    render(<TapTempo />)
    const pad = screen.getByRole("button", { name: /tap to set tempo/i })
    pad.focus()

    pressFourTimes(() => {
      fireEvent.keyDown(pad, { key: "Enter", code: "Enter" })
      fireEvent.click(pad)
    })

    expect(getBpm()).toBe("120")
  })

  it("does not tap when another control is activated by keyboard", () => {
    // Regression: Enter/Space on ANY focused control also logged a tap, so a
    // keyboard user nudging the tempo or toggling the metronome silently
    // corrupted the average (measured 122 BPM from four presses of "+").
    render(<TapTempo />)
    const increase = screen.getByRole("button", { name: /increase tempo/i })
    increase.focus()

    pressFourTimes(() => fireEvent.keyDown(increase, { key: "Enter", code: "Enter" }))
    pressFourTimes(() => fireEvent.keyDown(increase, { key: " ", code: "Space" }))

    expect(getBpm()).toBe("---")
  })

  it("counts one tap per key press from anywhere on the page", () => {
    // Tapping tempo with any key is the intended behaviour and has to survive
    // the two guards above.
    render(<TapTempo />)

    pressFourTimes(() => fireEvent.keyDown(document.body, { key: "q", code: "KeyQ" }))

    expect(getBpm()).toBe("120")
  })

  it("still taps on a non-activation key while a control has focus", () => {
    // The early return is scoped to Enter/Space. Clicking the pad focuses it,
    // and continuing to tap with a letter key from there must keep working.
    render(<TapTempo />)
    const pad = screen.getByRole("button", { name: /tap to set tempo/i })
    pad.focus()

    pressFourTimes(() => fireEvent.keyDown(pad, { key: "q", code: "KeyQ" }))

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
