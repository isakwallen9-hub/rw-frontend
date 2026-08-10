export default function RWLogo({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 130" className={className} xmlns="http://www.w3.org/2000/svg" aria-label="RW Systems">
      <defs>
        <linearGradient id="rwLogoGrad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%"   stopColor="#3A5CD8" />
          <stop offset="40%"  stopColor="#3A5CD8" />
          <stop offset="100%" stopColor="#1F369B" />
        </linearGradient>
      </defs>
      <text
        x="50%"
        y="110"
        textAnchor="middle"
        fontFamily='"Arial Black", "Arial Bold", Arial, sans-serif'
        fontWeight="900"
        fontSize="110"
        letterSpacing="-4"
        fill="url(#rwLogoGrad)"
      >RW</text>
    </svg>
  )
}
