/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        base: 'var(--c-base)',
        panel: 'var(--c-panel)',
        main: 'var(--c-main)',
        muted: 'var(--c-muted)',
        accent: 'var(--c-accent)',
        danger: 'var(--c-danger)',
        line: 'var(--c-line)',
        water: 'var(--c-water)',
      },
      fontFamily: {
        display: ['var(--font-display)', 'sans-serif'],
        sans: ['var(--font-body)', 'sans-serif'],
      },
      boxShadow: {
        card: 'var(--shadow-card)',
      },
      keyframes: {
        waveDrift: {
          '0%, 100%': { backgroundPosition: '0px 0px, 0px 0px' },
          '50%': { backgroundPosition: '40px -8px, -30px 6px' },
        },
        flagWave: {
          '0%, 100%': { transform: 'skewX(-6deg) translateY(0)' },
          '50%': { transform: 'skewX(6deg) translateY(-1px)' },
        },
        compassSpin: {
          '0%': { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' },
        },
        fuseBurn: { '0%': { width: '100%' }, '100%': { width: '0%' } },
        floatY: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-6px)' },
        },
        sink: {
          '0%': { transform: 'translateY(0) rotate(0deg)', opacity: '1' },
          '100%': { transform: 'translateY(60px) rotate(8deg)', opacity: '0.15' },
        },
        boom: {
          '0%': { transform: 'scale(0.2)', opacity: '0' },
          '20%': { transform: 'scale(1)', opacity: '1' },
          '100%': { transform: 'scale(1.6)', opacity: '0' },
        },
        ripple: {
          '0%': { transform: 'scale(0.3)', opacity: '0.9' },
          '100%': { transform: 'scale(2.2)', opacity: '0' },
        },
        shake: {
          '0%, 100%': { transform: 'translate(0,0)' },
          '20%': { transform: 'translate(-4px, 2px)' },
          '40%': { transform: 'translate(4px, -2px)' },
          '60%': { transform: 'translate(-3px, -1px)' },
          '80%': { transform: 'translate(3px, 1px)' },
        },
      },
      animation: {
        waveDrift: 'waveDrift 9s ease-in-out infinite',
        flagWave: 'flagWave 2.2s ease-in-out infinite',
        compassSpin: 'compassSpin 8s linear infinite',
        floatY: 'floatY 4s ease-in-out infinite',
        sink: 'sink 1.6s ease-in forwards',
        boom: 'boom 0.7s ease-out forwards',
        ripple: 'ripple 0.9s ease-out forwards',
        shake: 'shake 0.4s ease-in-out',
      },
    },
  },
  plugins: [],
};
