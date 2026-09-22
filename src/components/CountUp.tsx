import { useLayoutEffect, useRef, useState } from 'react'

// Animate a number from 0 up to `target`, ONCE — the first time a real (finite,
// non-zero) value appears. After that intro animation any later target change is
// shown immediately, so a background data refresh never re-triggers the count-up.
// Honours prefers-reduced-motion by showing the final value with no animation.
// Purely visual: the value ultimately shown is always exactly `target`.
export function useCountUp(target: number, durationMs = 650): number {
  const [display, setDisplay] = useState(0)
  const animated = useRef(false)
  const frame = useRef<number | null>(null)

  useLayoutEffect(() => {
    // Already ran the intro once → follow the real value directly.
    if (animated.current) { setDisplay(target); return }
    // Wait for a real value before animating; show it as-is meanwhile.
    if (!Number.isFinite(target) || target === 0) { setDisplay(target); return }

    const prefersReduced =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches

    animated.current = true
    if (prefersReduced) { setDisplay(target); return }

    const start = performance.now()
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs)
      const eased = 1 - Math.pow(1 - t, 3) // easeOutCubic — quick, no overshoot
      setDisplay(target * eased)
      if (t < 1) frame.current = requestAnimationFrame(step)
      else setDisplay(target)
    }
    frame.current = requestAnimationFrame(step)
    return () => { if (frame.current != null) cancelAnimationFrame(frame.current) }
  }, [target, durationMs])

  return display
}

// Renders a number with a one-time count-up on first appearance. `format` maps
// the (possibly fractional) in-flight number to the text shown each frame.
export default function CountUp({
  value,
  format = (n) => String(Math.round(n)),
  durationMs = 650,
}: {
  value: number
  format?: (n: number) => string
  durationMs?: number
}) {
  const n = useCountUp(value, durationMs)
  return <>{format(n)}</>
}
