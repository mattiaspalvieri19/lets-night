/** @type {import('tailwindcss').Config} */
// Colori allineati ai token di packages/shared/design.js (direzione "editoriale notturna").
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
        dark:     '#0A0A0C',
        card:     '#131316',
        card2:    '#1A1A1F',
        text2:    '#71717A',
      },
    },
  },
  plugins: [],
};
