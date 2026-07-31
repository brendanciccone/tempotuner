import { describe, expect, it } from "vitest"
import { cn } from "@/lib/utils"

// ----------------------------------------------------------------
// cn() merges Tailwind classes, and tailwind-merge only resolves conflicts it
// recognises. This theme adds custom --text-micro and --tracking-* tokens,
// which it does NOT recognise by default — so these guard the extension that
// teaches it, and the ordinary conflict resolution that must keep working
// alongside.
// ----------------------------------------------------------------

describe("cn", () => {
  it("returns an empty string for no input", () => {
    expect(cn()).toBe("")
  })

  it("drops falsy and conditional entries", () => {
    expect(cn("text-ink", false, null, undefined, "", "uppercase")).toBe("text-ink uppercase")
    expect(cn("text-ink", { "text-glow": false, uppercase: true })).toBe("text-ink uppercase")
  })
})

// ----------------------------------------------------------------
// The regression this file exists for
// ----------------------------------------------------------------

describe("cn and the custom text-micro token", () => {
  it("keeps text-micro when a colour class follows it", () => {
    // Regression: tailwind-merge classified `text-micro` as a text COLOUR, so
    // the later colour class evicted it and SelectLabel silently rendered at
    // body size (22px) instead of the intended 10px Silkscreen.
    const merged = cn("font-micro text-micro tracking-micro text-ink-faint")

    expect(merged).toContain("text-micro")
    expect(merged).toContain("text-ink-faint")
  })

  it("keeps text-micro regardless of which order the two are written in", () => {
    expect(cn("text-ink-faint text-micro")).toContain("text-micro")
    expect(cn("text-ink-faint text-micro")).toContain("text-ink-faint")
  })

  it("still treats text-micro as a size, so a later size wins", () => {
    // The extension must place the token in the font-size group, not merely
    // exempt it — two sizes are still a conflict.
    expect(cn("text-micro text-sm")).toBe("text-sm")
    expect(cn("text-sm text-micro")).toBe("text-micro")
  })

  it("still resolves ordinary conflicts", () => {
    expect(cn("text-ink text-ink-bright")).toBe("text-ink-bright")
    expect(cn("px-2 px-4")).toBe("px-4")
    expect(cn("border-stroke", "border-stroke-dim")).toBe("border-stroke-dim")
  })

  it("leaves non-conflicting classes alone", () => {
    expect(cn("font-micro tracking-micro uppercase")).toBe("font-micro tracking-micro uppercase")
  })
})

// ----------------------------------------------------------------
// The same hazard, one property over
// ----------------------------------------------------------------

describe("cn and the custom tracking tokens", () => {
  it("resolves two custom tracking values to the last one", () => {
    // Unregistered, these matched none of tailwind-merge's groups, so both
    // survived the merge and CSS source order decided the winner instead of
    // call order — a base class could silently beat the override meant to
    // replace it. Every UI primitive that sets tracking also merges className,
    // so this was reachable from any caller.
    expect(cn("tracking-display", "tracking-micro")).toBe("tracking-micro")
    expect(cn("tracking-micro", "tracking-display")).toBe("tracking-display")
    expect(cn("tracking-body", "tracking-display")).toBe("tracking-display")
  })

  it("treats a custom tracking value as conflicting with a stock one", () => {
    // They occupy one CSS property, so the group has to span both scales.
    expect(cn("tracking-display", "tracking-tight")).toBe("tracking-tight")
    expect(cn("tracking-widest", "tracking-body")).toBe("tracking-body")
  })

  it("keeps tracking alongside classes it does not conflict with", () => {
    const merged = cn("tracking-display", "text-ink", "uppercase")

    expect(merged).toContain("tracking-display")
    expect(merged).toContain("text-ink")
  })
})
