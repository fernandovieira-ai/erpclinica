import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--fonte-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--fonte-mono)', 'monospace'],
      },
    },
  },
  plugins: [],
}

export default config
