/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // ── Brand (blue) — anchors 50/100/500/600/700/900 given; gaps interpolated ──
        brand: {
          50:  '#F0F4FF',
          100: '#DDE5FC',
          200: '#C2CEF7',
          300: '#95A9EF',
          400: '#5E79E4',
          500: '#3A5CD8',
          600: '#2A47C0',
          700: '#1F369B',
          800: '#1A2D80',
          900: '#152663',
          950: '#0E1A45',
        },
        // ── Ink — warm neutrals (not cool gray). Anchors 400/500/600/800/900 given ──
        ink: {
          50:  '#F7F6F5',
          100: '#EEEDEC',
          200: '#DEDCDC',
          300: '#BEBCBF',
          400: '#72717C', // darkened from #8B8A93 to clear WCAG 4.5:1 as muted text on glass
          500: '#6B6A73',
          600: '#4E4D56',
          700: '#3A3940',
          800: '#2A2930',
          900: '#1A1920',
          950: '#100F14',
        },
        // ── Positive (green). Anchors 50/500/600 given ──
        positive: {
          50:  '#ECFAF3',
          100: '#CFF3E1',
          200: '#A2E6C6',
          300: '#63D3A3',
          400: '#23B37F',
          500: '#0E9C6B',
          600: '#0A7D55',
          700: '#096344',
          800: '#084F37',
          900: '#06412D',
        },
        // ── Negative (red). Anchors 50/500/600 given ──
        negative: {
          50:  '#FDF0F0',
          100: '#FADCDC',
          200: '#F4BEBE',
          300: '#EA9494',
          400: '#DC6A6A',
          500: '#CE4646',
          600: '#AE3838',
          700: '#8F2D2D',
          800: '#742626',
          900: '#602222',
        },
        // ── Caution (amber/yellow). Anchors 50/500 given ──
        caution: {
          50:  '#FEF6EC',
          100: '#FBE8CC',
          200: '#F6D399',
          300: '#EEB85F',
          400: '#DE9E37',
          500: '#C9821F',
          600: '#A66916',
          700: '#855314',
          800: '#6D4416',
          900: '#5C3A16',
        },
        // Legacy semantic tokens, repointed onto the brand ramp so existing
        // `text-primary` / `bg-accent` utilities pick up the new palette.
        primary: '#1F369B',
        accent:  '#3A5CD8',
      },
      fontFamily: {
        serif: ['Instrument Serif', 'Georgia', 'serif'],
        sans: ['General Sans', 'system-ui', 'sans-serif'],
      },
      // Three-level depth hierarchy — overrides the default scale so every
      // existing `shadow-*` utility is upgraded without touching components.
      //   sm  = resting card      md = hovered card
      //   xl/2xl = modals & panels (deepest)
      boxShadow: {
        sm:      '0 1px 2px rgba(26, 25, 32, 0.04), 0 4px 16px rgba(26, 25, 32, 0.04)',   // resting
        DEFAULT: '0 1px 2px rgba(26, 25, 32, 0.05), 0 6px 20px rgba(26, 25, 32, 0.06)',
        md:      '0 2px 4px rgba(26, 25, 32, 0.06), 0 12px 32px rgba(26, 25, 32, 0.08)',  // hovered
        lg:      '0 4px 10px rgba(26, 25, 32, 0.07), 0 18px 44px rgba(26, 25, 32, 0.10)',
        xl:      '0 10px 28px rgba(26, 25, 32, 0.10), 0 24px 56px rgba(26, 25, 32, 0.14)',
        '2xl':   '0 24px 64px rgba(26, 25, 32, 0.18)',                                    // modals / panels
      },
      transitionTimingFunction: {
        apple: 'cubic-bezier(0.22, 1, 0.36, 1)',
        'apple-in-out': 'cubic-bezier(0.65, 0, 0.35, 1)',
      },
      animation: {
        'orb-1': 'orb-float-1 18s ease-in-out infinite',
        'orb-2': 'orb-float-2 22s ease-in-out infinite',
        'orb-3': 'orb-float-3 26s ease-in-out infinite',
        'orb-4': 'orb-float-1 20s ease-in-out infinite reverse',
        'fade-rise': 'fade-rise 0.55s cubic-bezier(0.22, 1, 0.36, 1) both',
      },
      keyframes: {
        'fade-rise': {
          '0%':   { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'orb-float-1': {
          '0%, 100%': { transform: 'translate(0px, 0px) scale(1)' },
          '33%':       { transform: 'translate(28px, -38px) scale(1.04)' },
          '66%':       { transform: 'translate(-20px, 24px) scale(0.97)' },
        },
        'orb-float-2': {
          '0%, 100%': { transform: 'translate(0px, 0px) scale(1)' },
          '40%':       { transform: 'translate(-34px, 20px) scale(0.95)' },
          '70%':       { transform: 'translate(24px, -30px) scale(1.03)' },
        },
        'orb-float-3': {
          '0%, 100%': { transform: 'translate(0px, 0px) scale(1)' },
          '50%':       { transform: 'translate(20px, 34px) scale(1.05)' },
        },
      },
    },
  },
  plugins: [],
}
