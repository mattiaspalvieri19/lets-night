/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx}', './components/**/*.{js,jsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        brand: '#12A0D7',
        dark: '#0a0a0f',
        card: '#111118',
      },
    },
  },
  plugins: [],
};
