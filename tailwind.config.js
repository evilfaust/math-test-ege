/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'sans-serif'],
      },
      colors: {
        brand: {
          50: '#f0f4ff',
          100: '#e0e8ff',
          200: '#c7d4fd',
          500: '#4f6ef7',
          600: '#3d57e8',
          700: '#3246cc',
          900: '#1e2a7a',
        },
      },
      boxShadow: {
        card: '0 1px 2px 0 rgba(15,23,42,0.04), 0 1px 1px 0 rgba(15,23,42,0.02)',
        pop:  '0 4px 12px -2px rgba(15,23,42,0.08), 0 2px 4px -1px rgba(15,23,42,0.04)',
      },
    },
  },
  plugins: [],
}
