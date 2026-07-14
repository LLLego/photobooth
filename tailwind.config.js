/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,html}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
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
        honey: {
          400: '#FFD54F',
          500: '#FFB400',
          600: '#E09E00',
        },
        sage: {
          400: '#8FAC95',
          500: '#6B8F71',
          600: '#527058',
        },
        rose: {
          400: '#D47A7A',
          500: '#C44D4D',
        }
      },
      fontFamily: {
        display: ['Georgia', 'Times New Roman', 'serif'],
        body: ['system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
        mono: ['Courier New', 'Courier', 'monospace'],
      },
    },
  },
  plugins: [],
};
