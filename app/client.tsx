"use client"

import { useEffect, useRef, useState, type KeyboardEvent } from "react"
import TapTempo from "@/components/tap-tempo"
import Tuner from "@/components/tuner"
import { cn } from "@/lib/utils"

type TabId = "tuner" | "tempo"
const TAB_ORDER: readonly TabId[] = ["tuner", "tempo"] as const

export default function ClientApp() {
  const [mounted, setMounted] = useState(false)
  const [activeTab, setActiveTab] = useState<TabId>("tuner")
  const tabRefs = useRef<Record<TabId, HTMLButtonElement | null>>({
    tuner: null,
    tempo: null,
  })

  // WAI-ARIA tabs keyboard pattern (manual activation, horizontal orientation):
  // ArrowLeft/ArrowRight + Home/End move focus only. The user activates with Enter
  // or Space (handled natively by <button>). Manual activation avoids re-prompting
  // for mic permission on every arrow press (switching tabs unmounts the Tuner).
  // ArrowUp/ArrowDown are intentionally NOT handled — for a horizontal tablist the
  // APG specifies leaving them alone so they retain native page-scroll behavior.
  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, current: TabId) => {
    const currentIndex = TAB_ORDER.indexOf(current)
    let nextIndex: number | null = null

    switch (event.key) {
      case "ArrowRight":
        nextIndex = (currentIndex + 1) % TAB_ORDER.length
        break
      case "ArrowLeft":
        nextIndex = (currentIndex - 1 + TAB_ORDER.length) % TAB_ORDER.length
        break
      case "Home":
        nextIndex = 0
        break
      case "End":
        nextIndex = TAB_ORDER.length - 1
        break
    }

    if (nextIndex === null) return
    event.preventDefault()
    // Move focus only; do NOT change activeTab. Enter/Space on the focused tab
    // will fire its onClick and switch panels.
    tabRefs.current[TAB_ORDER[nextIndex]]?.focus()
  }

  useEffect(() => {
    setMounted(true)
  }, [])

  // Return null on server to prevent hydration issues
  if (!mounted) {
    return null
  }

  // Soft keys stay Title Case — casing is semantic, and these are operator
  // controls rather than the machine talking.
  //
  // The source framework gives a soft key a deep bottom lip (8px top, 20px
  // bottom) so it reads as a physical key. That works on its keys, which are
  // sized to their label; on a full-width flex key the same asymmetry just
  // reads as a label sitting too high. Keep the height, centre the label.
  const tabClasses = (tab: TabId) =>
    cn(
      "flex-1 flex items-center justify-center min-h-[60px] border-2 rounded-lg px-6 text-xl cursor-pointer",
      "focus:outline-none focus-visible:outline-2 focus-visible:outline-dashed focus-visible:outline-ink-dim focus-visible:outline-offset-[3px]",
      activeTab === tab
        ? "bg-fill text-on-fill border-fill box-glow"
        : "bg-transparent text-ink border-ink text-glow hover:text-ink-bright hover:border-ink-bright",
    )

  return (
    <main className="flex flex-1 flex-col p-5 sm:p-6">
      <div className="w-full max-w-[340px] sm:max-w-sm md:max-w-md mx-auto">
        <header className="mb-4 sm:mb-6">
          <div className="flex items-baseline justify-between gap-3 border-b-2 border-stroke-dim pb-2">
            <h1 className="flex items-center gap-2 text-xl sm:text-2xl tracking-display text-ink-bright text-glow">
              {/* Ornament is typographic. Sized down from the heading so the
                  half-block reads as a bar and not as a dropped capital. */}
              <span aria-hidden="true" className="text-base leading-none">
                ▌
              </span>
              TempoTuner
            </h1>
            <p className="font-micro text-micro tracking-micro text-ink-faint uppercase">
              Pitch / Tempo Console
            </p>
          </div>
        </header>

        {/* Tab Buttons */}
        <div role="tablist" aria-label="Tool selection" className="flex w-full gap-2 mb-4">
          <button
            ref={(el) => {
              tabRefs.current.tuner = el
            }}
            role="tab"
            id="tab-tuner"
            aria-selected={activeTab === "tuner"}
            aria-controls="panel-tuner"
            tabIndex={activeTab === "tuner" ? 0 : -1}
            onClick={() => setActiveTab("tuner")}
            onKeyDown={(e) => handleTabKeyDown(e, "tuner")}
            className={tabClasses("tuner")}
          >
            Tuner
          </button>
          <button
            ref={(el) => {
              tabRefs.current.tempo = el
            }}
            role="tab"
            id="tab-tempo"
            aria-selected={activeTab === "tempo"}
            aria-controls="panel-tempo"
            tabIndex={activeTab === "tempo" ? 0 : -1}
            onClick={() => setActiveTab("tempo")}
            onKeyDown={(e) => handleTabKeyDown(e, "tempo")}
            className={tabClasses("tempo")}
          >
            Tempo
          </button>
        </div>

        {/* Content */}
        <div
          role="tabpanel"
          id="panel-tempo"
          aria-labelledby="tab-tempo"
          hidden={activeTab !== "tempo"}
        >
          {activeTab === "tempo" && <TapTempo />}
        </div>
        <div
          role="tabpanel"
          id="panel-tuner"
          aria-labelledby="tab-tuner"
          hidden={activeTab !== "tuner"}
        >
          {activeTab === "tuner" && <Tuner key="tuner-component" />}
        </div>
      </div>
    </main>
  )
}
