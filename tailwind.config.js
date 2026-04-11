/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./App.{js,jsx,ts,tsx}', './index.{js,jsx,ts,tsx}', './src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        industrial: {
          bg: '#1E2329',
          surface: '#2A3138',
          primary: '#FFB020',
          secondary: '#4D8BFF',
          text: '#F3F5F7',
          muted: '#94A3B8',
          border: '#3F474F',
        },
      },
      borderRadius: {
        ind: '6px',
      },
    },
  },
  plugins: [],
}

