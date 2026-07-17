/** @type {import('tailwindcss').Config} */
// Tailwind config retained for compatibility — CSS now lives in src/styles/main.css
// using GLM-5.2 design system. Tailwind directives are stripped from main.css.
export default {
  content: ['./index.html', './src/**/*.{js,html}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        terracotta: '#D4956A',
        cream: '#FFFAF0',
        chocolate: '#2D1B11',
        honey: '#FFB400',
        // Legacy warmth palette aliases — preserved so existing classNames still resolve.
        warmth: {
          50: '#FFFAF0',
          100: '#FFF3E0',
          200: '#FFE4C4',
          300: '#F5D5A8',
          400: '#D4956A',
          500: '#C47A50',
          600: '#A85D3A',
          700: '#7A3E25',
          800: '#4A2515',
          900: '#2D1B11',
        },
        sage: { 500: '#6B8F71' },
        rose: { 500: '#C44D4D' },
      },
      fontFamily: {
        display: ['Fraunces', 'Playfair Display', 'Georgia', 'serif'],
        body: ['"DM Sans"', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['"Courier New"', 'Courier', 'monospace'],
      },
    },
  },
  plugins: [],
};
