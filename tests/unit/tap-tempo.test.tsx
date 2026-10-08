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

  it("counts one tap per pointer press, on the press rather than the release", () => {
    // A pointer press is pointerdown followed by a click (detail 1). Tapping on
    // pointerdown times the hit, not however long the finger stayed down, and
    // the trailing click must not count a second time.
    render(<TapTempo />)
    const pad = screen.getByRole("button", { name: /tap to set tempo/i })

    // Presses land 500ms apart but are held for different lengths; timing the
    // releases instead would read 105 BPM.
    const holdTimes = [40, 180, 90, 260]
    holdTimes.forEach((hold, i) => {
      fireEvent.pointerDown(pad, { button: 0 })
      vi.advanceTimersByTime(hold)
      fireEvent.click(pad, { detail: 1 })
      if (i < holdTimes.length - 1) vi.advanceTimersByTime(500 - hold)
    })

    expect(getBpm()).toBe("120")
  })

  it("counts a mouse or pen press even when its click never arrives", () => {
    // A mouse press dragged off the pad before release gets no click; it was
    // already counted on pointerdown, which is the moment of the hit.
    render(<TapTempo />)
    const pad = screen.getByRole("button", { name: /tap to set tempo/i })

    pressFourTimes(() => fireEvent.pointerDown(pad, { button: 0 }))

    expect(getBpm()).toBe("120")
  })

  it("counts an assistive-tech click that arrives without a pointer event", () => {
    // Regression: Firefox's accessibility "press" (NVDA/JAWS browse mode,
    // VoiceOver, TalkBack) sends mousedown, mouseup and a click with detail 1,
    // but no pointerdown. Deduping on detail === 0 dropped every one of them.
    render(<TapTempo />)
    const pad = screen.getByRole("button", { name: /tap to set tempo/i })

    pressFourTimes(() => {
      fireEvent.mouseDown(pad)
      fireEvent.mouseUp(pad)
      fireEvent.click(pad, { detail: 1 })
    })

    expect(getBpm()).toBe("120")
  })

  it("does not let a pointer press that never clicked swallow the next keyboard tap", () => {
    // A press that is dragged off the pad taps on pointerdown and then never
    // gets its click; the next Enter on the pad must still count.
    render(<TapTempo />)
    const pad = screen.getByRole("button", { name: /tap to set tempo/i })

    fireEvent.pointerDown(pad, { button: 0 })
    vi.advanceTimersByTime(500)
    fireEvent.keyDown(pad, { key: "Enter", code: "Enter" })
    fireEvent.click(pad, { detail: 0 })

    expect(getBpm()).toBe("120")
  })

  it.each(["touch", "pen"])("does not tap when a %s press on the pad turns into a scroll", (pointerType) => {
    // Regression: taps counted on pointerdown, which a touch sends before the
    // browser knows whether the finger is panning. A swipe that started on
    // the pad was a beat — and more than 2s after the last one it cleared the
    // reading and sent a running metronome back to 120. When the browser
    // takes a touch over for a pan or pinch it sends pointercancel instead of
    // pointerup, and the press is dropped.
    render(<TapTempo />)
    const pad = screen.getByRole("button", { name: /tap to set tempo/i })

    pressFourTimes(() => {
      fireEvent.pointerDown(pad, { button: 0, pointerType: "touch", pointerId: 1 })
      fireEvent.pointerUp(pad, { button: 0, pointerType: "touch", pointerId: 1 })
      fireEvent.click(pad, { detail: 1 })
    })
    expect(getBpm()).toBe("120")

    // A finger or a stylus (Apple Pencil, S Pen) can both start a scroll.
    vi.advanceTimersByTime(3000)
    fireEvent.pointerDown(pad, { button: 0, pointerType, pointerId: 2 })
    fireEvent.pointerCancel(pad, { pointerType, pointerId: 2 })

    expect(getBpm()).toBe("120")
  })

  it("times a touch tap from when the finger lands, not when it lifts", () => {
    // The tap is committed on release (only then is it known not to be a
    // scroll) but stamped with the press time, so hold length stays out of
    // the interval: timing the releases here would read 105 BPM.
    render(<TapTempo />)
    const pad = screen.getByRole("button", { name: /tap to set tempo/i })

    const holdTimes = [40, 180, 90, 260]
    holdTimes.forEach((hold, i) => {
      fireEvent.pointerDown(pad, { button: 0, pointerType: "touch", pointerId: i + 1 })
      vi.advanceTimersByTime(hold)
      fireEvent.pointerUp(pad, { button: 0, pointerType: "touch", pointerId: i + 1 })
      fireEvent.click(pad, { detail: 1 })
      if (i < holdTimes.length - 1) vi.advanceTimersByTime(500 - hold)
    })

    expect(getBpm()).toBe("120")
  })

  it("does not repeat taps while Enter is held on the focused pad", () => {
    // The window listener skips auto-repeat, but on a focused button every
    // repeated Enter is also turned into a click by the browser. Cancelling
    // the repeated keydown is what stops that click.
    render(<TapTempo />)
    const pad = screen.getByRole("button", { name: /tap to set tempo/i })
    pad.focus()

    const notCancelled = fireEvent.keyDown(pad, { key: "Enter", code: "Enter", repeat: true })

    expect(notCancelled).toBe(false)
  })

  it("does not scroll the page while Space is held", () => {
    // Regression: the repeat filter returned before the Space preventDefault,
    // so only the first keydown of a held Space was cancelled and the rest
    // scrolled the page.
    render(<TapTempo />)

    fireEvent.keyDown(document.body, { key: " ", code: "Space" })
    const repeatNotCancelled = fireEvent.keyDown(document.body, { key: " ", code: "Space", repeat: true })

    expect(repeatNotCancelled).toBe(false)
    expect(getBpm()).toBe("---")
  })

  it("ignores secondary-button presses", () => {
    render(<TapTempo />)
    const pad = screen.getByRole("button", { name: /tap to set tempo/i })

    pressFourTimes(() => fireEvent.pointerDown(pad, { button: 2 }))

    expect(getBpm()).toBe("---")
  })

  it("does not tap on key auto-repeat", () => {
    // Regression: holding a key fires keydown ~30 times a second, and every
    // repeat counted, reading ~1800 BPM.
    render(<TapTempo />)

    fireEvent.keyDown(document.body, { key: "q", code: "KeyQ" })
    for (let i = 0; i < 10; i++) {
      vi.advanceTimersByTime(33)
      fireEvent.keyDown(document.body, { key: "q", code: "KeyQ", repeat: true })
    }

    expect(getBpm()).toBe("---")
  })

  it("does not tap on shortcuts or navigation keys", () => {
    // Regression: Tab to move focus, Escape to close the dropdown, the arrows
    // on the tempo slider and Cmd/Ctrl shortcuts all logged taps.
    render(<TapTempo />)

    const nonTaps = [
      { key: "Tab", code: "Tab" },
      { key: "Escape", code: "Escape" },
      { key: "ArrowRight", code: "ArrowRight" },
      { key: "Shift", code: "ShiftLeft" },
      { key: "F5", code: "F5" },
      { key: "c", code: "KeyC", metaKey: true },
      { key: "r", code: "KeyR", ctrlKey: true },
      { key: "q", code: "KeyQ", altKey: true },
    ]
    nonTaps.forEach((init) => {
      fireEvent.keyDown(document.body, init)
      vi.advanceTimersByTime(500)
    })

    expect(getBpm()).toBe("---")
  })

  it("taps on Space and Shift+letter from the page", () => {
    render(<TapTempo />)

    pressFourTimes(() => fireEvent.keyDown(document.body, { key: " ", code: "Space" }))
    expect(getBpm()).toBe("120")

    vi.advanceTimersByTime(2500)
    pressFourTimes(() => fireEvent.keyDown(document.body, { key: "Q", code: "KeyQ", shiftKey: true }))
    expect(getBpm()).toBe("120")
  })

  it("does not tap on keys typed into an open dropdown list", () => {
    // Letters drive an open list's typeahead and Enter picks the option.
    render(<TapTempo />)
    const list = document.createElement("div")
    list.setAttribute("role", "listbox")
    const option = document.createElement("div")
    option.setAttribute("role", "option")
    option.tabIndex = -1
    list.appendChild(option)
    document.body.appendChild(list)

    pressFourTimes(() => fireEvent.keyDown(option, { key: "6", code: "Digit6" }))
    pressFourTimes(() => fireEvent.keyDown(option, { key: "Enter", code: "Enter" }))

    expect(getBpm()).toBe("---")
    list.remove()
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
