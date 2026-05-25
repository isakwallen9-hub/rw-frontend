import { useEffect, useState, useCallback } from 'react'

interface Step {
  target: string | null
  title: string
  body: string
  preferredSide?: 'top' | 'bottom' | 'left' | 'right'
}

const STEPS: Step[] = [
  {
    target: null,
    title: 'Välkommen till RW Systems!',
    body: 'RW Systems hjälper dig att förstå och förbättra ditt företags kassaflöde. Vi analyserar din ekonomidata och ger dig konkreta åtgärder för att maximera din likviditet.',
  },
  {
    target: 'kpi-cards',
    title: 'Din ekonomiska hälsa',
    body: 'Här ser du de viktigaste nyckeltalen — likvida medel, förfallna fakturor, break-even, runway och bruttomarginal. Klicka på ett kort för att se mer detaljer.',
    preferredSide: 'bottom',
  },
  {
    target: 'cashflow-chart',
    title: 'Din kassaflödeshistorik',
    body: 'Grafen visar ditt inflöde och utflöde dag för dag. Håll koll på trender och identifiera perioder med låg likviditet.',
    preferredSide: 'top',
  },
  {
    target: 'coach-button',
    title: 'Din personliga ekonomicoach',
    body: 'Klicka här för att chatta med din AI-ekonomicoach. Ställ frågor om ditt kassaflöde, fakturor eller åtgärder och få personliga råd direkt.',
    preferredSide: 'top',
  },
  {
    target: 'import-link',
    title: 'Importera din data',
    body: 'Kom igång genom att importera din bankdata eller fakturor. Vi stöder Excel- och CSV-filer och hittar automatiskt rätt kolumner.',
    preferredSide: 'bottom',
  },
]

const TOOLTIP_W = 320
const TOOLTIP_H = 230
const HIGHLIGHT_PAD = 8
const GAP = 14

interface TargetRect {
  top: number
  left: number
  width: number
  height: number
}

function computeTooltipPos(
  rect: TargetRect,
  side: string,
  vpW: number,
  vpH: number,
): React.CSSProperties {
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
  const hTop = rect.top - HIGHLIGHT_PAD
  const hLeft = rect.left - HIGHLIGHT_PAD
  const hW = rect.width + HIGHLIGHT_PAD * 2
  const hH = rect.height + HIGHLIGHT_PAD * 2

  if (side === 'bottom') {
    return {
      top: hTop + hH + GAP,
      left: clamp(hLeft + hW / 2 - TOOLTIP_W / 2, 16, vpW - TOOLTIP_W - 16),
    }
  }
  if (side === 'top') {
    return {
      top: Math.max(16, hTop - TOOLTIP_H - GAP),
      left: clamp(hLeft + hW / 2 - TOOLTIP_W / 2, 16, vpW - TOOLTIP_W - 16),
    }
  }
  if (side === 'right') {
    return {
      top: clamp(hTop + hH / 2 - TOOLTIP_H / 2, 16, vpH - TOOLTIP_H - 16),
      left: hLeft + hW + GAP,
    }
  }
  // left
  return {
    top: clamp(hTop + hH / 2 - TOOLTIP_H / 2, 16, vpH - TOOLTIP_H - 16),
    left: Math.max(16, hLeft - TOOLTIP_W - GAP),
  }
}

function chooseSide(
  rect: TargetRect,
  preferred: string | undefined,
  vpW: number,
  vpH: number,
): string {
  const hH = rect.height + HIGHLIGHT_PAD * 2
  const hTop = rect.top - HIGHLIGHT_PAD
  const hLeft = rect.left - HIGHLIGHT_PAD
  const hW = rect.width + HIGHLIGHT_PAD * 2

  const spaceBelow = vpH - (hTop + hH)
  const spaceAbove = hTop
  const spaceRight = vpW - (hLeft + hW)
  const spaceLeft = hLeft

  const fits = {
    bottom: spaceBelow >= TOOLTIP_H + GAP,
    top: spaceAbove >= TOOLTIP_H + GAP,
    right: spaceRight >= TOOLTIP_W + GAP,
    left: spaceLeft >= TOOLTIP_W + GAP,
  }

  if (preferred && fits[preferred as keyof typeof fits]) return preferred
  if (fits.bottom) return 'bottom'
  if (fits.top) return 'top'
  if (fits.right) return 'right'
  return 'left'
}

export default function Tour({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState(0)
  const [rect, setRect] = useState<TargetRect | null>(null)
  const [vp, setVp] = useState({ w: window.innerWidth, h: window.innerHeight })

  const current = STEPS[step]

  const measureTarget = useCallback(() => {
    if (!current.target) { setRect(null); return }
    const el = document.querySelector(`[data-tour="${current.target}"]`)
    if (el) {
      const r = el.getBoundingClientRect()
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height })
    } else {
      setRect(null)
    }
  }, [current.target])

  // Scroll target into view, then re-measure
  useEffect(() => {
    if (!current.target) { setRect(null); return }
    const el = document.querySelector(`[data-tour="${current.target}"]`)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      const t = setTimeout(measureTarget, 380)
      return () => clearTimeout(t)
    }
    measureTarget()
  }, [current.target, measureTarget])

  // Re-measure on resize
  useEffect(() => {
    const onResize = () => {
      setVp({ w: window.innerWidth, h: window.innerHeight })
      measureTarget()
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [measureTarget])

  const next = () => step < STEPS.length - 1 ? setStep(s => s + 1) : onComplete()
  const prev = () => setStep(s => Math.max(0, s - 1))

  const side = rect ? chooseSide(rect, current.preferredSide, vp.w, vp.h) : 'bottom'
  const tooltipStyle: React.CSSProperties = rect
    ? computeTooltipPos(rect, side, vp.w, vp.h)
    : { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }

  return (
    <>
      {/* Overlay — full dark bg for no-target steps, transparent for spotlight steps */}
      {!rect ? (
        <div
          className="fixed inset-0 bg-black/60 z-[9997]"
          onClick={e => e.stopPropagation()}
        />
      ) : (
        /* Spotlight: the highlight box casts a 9999px box-shadow that acts as the overlay */
        <div
          style={{
            position: 'fixed',
            top: rect.top - HIGHLIGHT_PAD,
            left: rect.left - HIGHLIGHT_PAD,
            width: rect.width + HIGHLIGHT_PAD * 2,
            height: rect.height + HIGHLIGHT_PAD * 2,
            borderRadius: 10,
            boxShadow: '0 0 0 9999px rgba(0,0,0,0.6)',
            outline: '2px solid #2563eb',
            outlineOffset: 0,
            pointerEvents: 'none',
            zIndex: 9997,
          }}
        />
      )}

      {/* Tooltip */}
      <div
        style={{ ...tooltipStyle, position: 'fixed', width: TOOLTIP_W, zIndex: 9999 }}
        className="bg-white rounded-2xl shadow-2xl p-6 pointer-events-auto"
      >
        {/* Step dots */}
        <div className="flex items-center gap-1.5 mb-4">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === step
                  ? 'w-6 bg-accent'
                  : i < step
                  ? 'w-3 bg-accent/30'
                  : 'w-3 bg-gray-200'
              }`}
            />
          ))}
        </div>

        <h3 className="text-base font-bold text-gray-900 mb-2 leading-snug">{current.title}</h3>
        <p className="text-sm text-gray-500 leading-relaxed mb-5">{current.body}</p>

        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {step > 0 && (
              <button
                onClick={prev}
                className="px-3 py-2 text-sm text-gray-500 border border-gray-200 rounded-lg hover:border-gray-300 transition-colors min-h-[36px]"
              >
                ← Föregående
              </button>
            )}
            {step === 0 && (
              <button
                onClick={onComplete}
                className="text-sm text-gray-400 hover:text-gray-600 transition-colors py-2 min-h-[36px]"
              >
                Hoppa över
              </button>
            )}
          </div>
          <button
            onClick={next}
            className="px-5 py-2 bg-accent text-white text-sm font-semibold rounded-lg hover:opacity-90 transition-opacity min-h-[36px]"
          >
            {step === STEPS.length - 1 ? 'Kom igång! →' : 'Nästa →'}
          </button>
        </div>
      </div>
    </>
  )
}