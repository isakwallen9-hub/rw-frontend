/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: '#1e3a5f',
        accent:  '#2563eb',
      },
      fontFamily: {
        serif: ['Instrument Serif', 'Georgia', 'serif'],
        sans: ['Geist', 'system-ui', 'sans-serif'],
      },
      // Soft, layered, diffuse depth — Apple-style ambient shadows.
      // Overrides the default scale, so every existing `shadow-*` utility
      // across the app is upgraded without touching a single component.
      boxShadow: {
        sm:      '0 1px 2px rgba(15, 23, 42, 0.04), 0 1px 3px rgba(15, 23, 42, 0.05)',
        DEFAULT: '0 1px 2px rgba(15, 23, 42, 0.04), 0 4px 12px -2px rgba(15, 23, 42, 0.06)',
        md:      '0 2px 4px rgba(15, 23, 42, 0.04), 0 8px 20px -4px rgba(15, 23, 42, 0.08)',
        lg:      '0 4px 8px rgba(15, 23, 42, 0.04), 0 16px 32px -8px rgba(15, 23, 42, 0.10)',
        xl:      '0 8px 16px rgba(15, 23, 42, 0.05), 0 24px 48px -12px rgba(15, 23, 42, 0.12)',
        '2xl':   '0 16px 32px rgba(15, 23, 42, 0.08), 0 40px 72px -16px rgba(15, 23, 42, 0.16)',
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
