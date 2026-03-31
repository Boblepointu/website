/** @type {import('tailwindcss').Config} */
function rgbVar(name) {
  return ({ opacityValue }) =>
    opacityValue !== undefined
      ? `rgb(var(--color-${name}) / ${opacityValue})`
      : `rgb(var(--color-${name}))`;
}

const shades = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];

function palette(prefix) {
  const o = { DEFAULT: rgbVar(`${prefix}-DEFAULT`) };
  for (const s of shades) o[s] = rgbVar(`${prefix}-${s}`);
  return o;
}

module.exports = {
  content: [
    './templates/**/*.html',
    './scripts/build/**/*.js',
    './assets/css/input.css'
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: palette('primary'),
        background: 'rgb(var(--ui-background) / <alpha-value>)',
        foreground: 'rgb(var(--ui-foreground) / <alpha-value>)',
      }
    }
  },
  plugins: []
};
