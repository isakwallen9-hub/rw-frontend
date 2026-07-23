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
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      animation: {
        'orb-1': 'orb-float-1 18s ease-in-out infinite',
        'orb-2': 'orb-float-2 22s ease-in-out infinite',
        'orb-3': 'orb-float-3 26s ease-in-out infinite',
        'orb-4': 'orb-float-1 20s ease-in-out infinite reverse',
      },
      keyframes: {
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
