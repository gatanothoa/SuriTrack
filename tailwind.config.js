/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./App.{js,jsx,ts,tsx}', './index.{js,jsx,ts,tsx}', './src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        corporate: {
          bg: '#FFFFFF',
          surface: '#F5F9FF',
          primary: '#0052CC',
          primaryHover: '#003D99',
          secondary: '#EAF2FF',
          text: '#0D2447',
          muted: '#4E6B94',
          border: '#C9DAF2',
          error: '#1F4DA8',
        },
      },
      borderRadius: {
        ind: '6px',
      },
    },
  },
  plugins: [],
}

