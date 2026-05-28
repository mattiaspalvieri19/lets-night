/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx}', './components/**/*.{js,jsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        brand:    '#7C3AED',
        'brand-light': '#A855F7',
        fuchsia:  '#C026D3',
        gold:     '#F59E0B',
        dark:     '#09090f',
        card:     '#111118',
        card2:    '#18181f',
        text2:    '#64748B',
      },
    },
  },
  plugins: [],
};
