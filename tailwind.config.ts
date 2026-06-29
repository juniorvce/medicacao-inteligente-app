import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}'
  ],
  theme: {
    extend: {
      colors: {
        // Primary: Coral (action, CTA, highlights)
        brand: {
          50:  '#fff1f2',
          100: '#ffe4e6',
          200: '#fecdd3',
          300: '#fda4af',
          400: '#fb7185',
          500: '#f43f5e',
          600: '#e11d48',
          700: '#be123c',
          800: '#9f1239',
          900: '#881337'
        },
        // Warm background: Apricot / Peach
        apricot: {
          50:  '#fffbf0',
          100: '#fef3c7',
          200: '#fde68a',
          300: '#fcd34d',
          400: '#fbbf24',
          500: '#f59e0b',
        },
        // Accent: Terracotta / Amber-brown
        terracotta: {
          400: '#d97706',
          500: '#b45309',
          600: '#92400e',
        },
        // Soft neutrals
        warm: {
          50:  '#fdf8f6',
          100: '#faf0eb',
          200: '#f5e0d5',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif']
      },
      boxShadow: {
        'coral': '0 4px 20px rgba(244, 63, 94, 0.25)',
        'card': '0 2px 12px rgba(180, 83, 9, 0.08)',
      }
    }
  },
  plugins: []
}

export default config
