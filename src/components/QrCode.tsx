import { useMemo } from 'react'
import qrcode from 'qrcode-generator'

// Renders a QR code as inline SVG entirely client-side (qrcode-generator is
// zero-dependency). The otpauth URI contains the TOTP secret, so it must never
// be sent to a third-party image service — this keeps it in the browser.
export function QrCode({ value, size = 200 }: { value: string; size?: number }) {
  const { count, cells } = useMemo(() => {
    const qr = qrcode(0, 'M')
    qr.addData(value)
    qr.make()
    const n = qr.getModuleCount()
    const dark: { x: number; y: number }[] = []
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (qr.isDark(r, c)) dark.push({ x: c, y: r })
      }
    }
    return { count: n, cells: dark }
  }, [value])

  const MARGIN = 4 // quiet zone required for reliable scanning
  const total = count + MARGIN * 2
  const cell = size / total

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label="QR-kod för tvåfaktorsautentisering"
      className="rounded-2xl shrink-0"
    >
      <rect width={size} height={size} fill="#ffffff" />
      {cells.map((m, i) => (
        <rect key={i} x={(m.x + MARGIN) * cell} y={(m.y + MARGIN) * cell} width={cell} height={cell} fill="#1A1920" />
      ))}
    </svg>
  )
}
