/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: {
          950: '#050a14',
          900: '#0a1226',
          800: '#0f1c3a',
          700: '#152954',
          600: '#1d3b78',
        },
        sonar: {
          400: '#4ade80',
          500: '#22c55e',
          600: '#16a34a',
        },
        cyber: {
          cyan: '#22d3ee',
          mint: '#5eead4',
          red: '#ef4444',
          gold: '#fbbf24',
        },
      },
      fontFamily: {
        display: ['"Orbitron"', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        sonar: '0 0 20px rgba(34, 211, 238, 0.45)',
        radar: '0 0 30px rgba(74, 222, 128, 0.4)',
        glow: '0 0 40px rgba(34, 211, 238, 0.25)',
      },
      keyframes: {
        sonarPulse: {
          '0%':   { transform: 'scale(0.3)',  opacity: '0.9' },
          '100%': { transform: 'scale(1.8)', opacity: '0' },
        },
        radarSweep: {
          '0%':   { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' },
        },
        waterShimmer: {
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '50%':      { backgroundPosition: '100% 50%' },
        },
      },
      animation: {
        sonarPulse: 'sonarPulse 1.4s ease-out infinite',
        radarSweep: 'radarSweep 3.5s linear infinite',
        waterShimmer: 'waterShimmer 6s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
