/**
 * Radix-2 FFT, used by the tuner to compute YIN's difference function in
 * O(N log N) instead of O(N²). See `differenceFunction` in audio-processing.ts
 * for why that matters.
 */

interface Twiddles {
  cos: Float64Array
  sin: Float64Array
}

// The tuner runs one FFT size for the life of the page, so the trig tables are
// computed once and reused for every frame.
const twiddleCache = new Map<number, Twiddles>()

const getTwiddles = (size: number): Twiddles => {
  const cached = twiddleCache.get(size)
  if (cached) return cached

  const half = size >> 1
  const cos = new Float64Array(half)
  const sin = new Float64Array(half)
  for (let k = 0; k < half; k++) {
    const angle = (2 * Math.PI * k) / size
    cos[k] = Math.cos(angle)
    sin[k] = Math.sin(angle)
  }
  const twiddles = { cos, sin }
  twiddleCache.set(size, twiddles)
  return twiddles
}

export const isPowerOfTwo = (n: number): boolean => Number.isInteger(n) && n > 0 && (n & (n - 1)) === 0

/** The smallest power of two that is at least `n`. */
export const nextPowerOfTwo = (n: number): number => {
  if (!Number.isFinite(n) || n < 1) {
    throw new RangeError(`nextPowerOfTwo needs a finite value of at least 1, got ${n}`)
  }
  let size = 1
  while (size < n) size <<= 1
  return size
}

/**
 * In-place forward DFT, X[k] = Σ x[j]·e^(−2πijk/N), on separate real and
 * imaginary arrays. Iterative Cooley–Tukey: bit-reversal permutation, then
 * log2(N) butterfly passes.
 */
export const fftInPlace = (re: Float64Array, im: Float64Array): void => {
  const n = re.length
  if (im.length !== n) {
    throw new RangeError(`FFT real and imaginary parts differ in length: ${n} vs ${im.length}`)
  }
  if (!isPowerOfTwo(n)) {
    throw new RangeError(`FFT size must be a power of two, got ${n}`)
  }

  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) {
      const tr = re[i]
      re[i] = re[j]
      re[j] = tr
      const ti = im[i]
      im[i] = im[j]
      im[j] = ti
    }
  }

  const { cos, sin } = getTwiddles(n)
  for (let size = 2; size <= n; size <<= 1) {
    const half = size >> 1
    const stride = n / size
    for (let start = 0; start < n; start += size) {
      for (let k = 0; k < half; k++) {
        const wr = cos[k * stride]
        const wi = -sin[k * stride]
        const a = start + k
        const b = a + half
        const tr = wr * re[b] - wi * im[b]
        const ti = wr * im[b] + wi * re[b]
        re[b] = re[a] - tr
        im[b] = im[a] - ti
        re[a] += tr
        im[a] += ti
      }
    }
  }
}
