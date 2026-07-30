import "@testing-library/jest-dom/vitest"

// jsdom does not implement ResizeObserver, and the Radix primitives this app
// renders (Slider, Select) construct one on mount. Without it, rendering any
// component tree containing them throws before a single assertion runs.
class ResizeObserverStub implements ResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

globalThis.ResizeObserver ??= ResizeObserverStub
