import { createRequire } from "node:module"
import { describe, expect, it } from "vitest"

// ----------------------------------------------------------------
// Dependabot alerts #79 and #80 were both closed by flooring `browserslist` at
// 4.28.7 through a pnpm override, not by changing any code in this repo. That
// makes the fix invisible to every other test here: a regenerated lockfile, a
// dropped override or a resolution that quietly lands below the floor would
// reintroduce both bugs with nothing failing.
//
// These assert the resolved dependency's behaviour rather than the version
// string alone, so they fail on the actual defect rather than on bookkeeping.
// ----------------------------------------------------------------

const require = createRequire(import.meta.url)

type BrowserslistNodeModule = {
  getStat: (
    opts: { stats?: unknown },
    data: Record<string, { versions: string[] }>
  ) => Record<string, unknown> | undefined
}

const browserslistNode = require("browserslist/node.js") as BrowserslistNodeModule

// caniuse-style data, standing in for the real `browserslist.data`. It has no
// own "__proto__" key, which is the whole point: the pre-fix lookup found one
// anyway by walking the prototype chain.
const browserData = { chrome: { versions: ["1.0"] } }

// A custom browserslist-stats.json is read with JSON.parse, which is the only
// way "__proto__" becomes a real own, enumerable property that for..in walks.
// The key has to be in the JSON *text*: `{ __proto__: … }` in an object literal
// sets the prototype instead of defining a key, so building the payload that
// way and stringifying it would silently test nothing.
const statsWithProtoKey = (versions: Record<string, number>) =>
  JSON.parse(`{"__proto__":${JSON.stringify(versions)},"chrome":{"1.0":50}}`) as unknown

describe("browserslist normalizeStats (GHSA / Dependabot #80)", () => {
  it("does not crash on a __proto__ key in custom stats", () => {
    // Pre-fix: `data["__proto__"]` resolved to Object.prototype — truthy, so
    // the branch was taken — and `.versions` was undefined, throwing
    // "Cannot read properties of undefined (reading 'length')" out of the build.
    expect(() =>
      browserslistNode.getStat({ stats: statsWithProtoKey({ "1.0": 100 }) }, browserData)
    ).not.toThrow()
  })

  it("stores __proto__ as an own property instead of writing the prototype", () => {
    // Two versions steers past the branch above and onto `normalized[i] = stats[i]`,
    // which pre-fix invoked the __proto__ setter and swapped the result's
    // prototype for attacker-supplied data rather than storing a key under it.
    const normalized = browserslistNode.getStat(
      { stats: statsWithProtoKey({ "1.0": 1, "2.0": 2 }) },
      browserData
    )

    expect(normalized).toBeDefined()
    expect(Object.getPrototypeOf(normalized)).toBeNull()
    expect(Object.prototype.hasOwnProperty.call(normalized, "__proto__")).toBe(true)
  })

  it("leaves Object.prototype untouched", () => {
    browserslistNode.getStat({ stats: statsWithProtoKey({ "1.0": 1, "2.0": 2 }) }, browserData)

    expect(Object.getPrototypeOf({})).toBe(Object.prototype)
    expect(({} as Record<string, unknown>)["1.0"]).toBeUndefined()
  })

  it("still normalises ordinary browsers", () => {
    const normalized = browserslistNode.getStat(
      { stats: JSON.parse('{"chrome":{"1.0":50}}') },
      browserData
    )

    expect(normalized).toMatchObject({ chrome: { "1.0": 50 } })
  })
})

describe("browserslist query cache (GHSA / Dependabot #79)", () => {
  // The caches are module-private, so there is no non-flaky way to assert the
  // 500-entry FIFO bound from outside — a memory-growth test would measure the
  // GC as much as the cache. The version floor is the assertion instead: 4.28.7
  // is the release that replaced both unbounded object caches with capped Maps,
  // and the behavioural tests above prove that floor is the one installed.
  it("resolves at or above the 4.28.7 floor", () => {
    const { version } = require("browserslist/package.json") as { version: string }
    const [major, minor, patch] = version.split(".").map(Number)

    expect(major).toBe(4)
    expect(minor * 1000 + patch).toBeGreaterThanOrEqual(28 * 1000 + 7)
  })
})
