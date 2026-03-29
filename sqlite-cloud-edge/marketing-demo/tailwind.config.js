/** @type {import('tailwindcss').Config} */
function rgb(varName) {
  return `rgb(var(${varName}) / <alpha-value>)`;
}

module.exports = {
  content: ['./dist/**/*.html'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['"DM Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif', '"Apple Color Emoji"', '"Segoe UI Emoji"', '"Segoe UI Symbol"', '"Noto Color Emoji"'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace']
      },
      colors: {
        primary: {
          DEFAULT: rgb('--color-primary-DEFAULT'),
          50: rgb('--color-primary-50'),
          100: rgb('--color-primary-100'),
          200: rgb('--color-primary-200'),
          300: rgb('--color-primary-300'),
          400: rgb('--color-primary-400'),
          500: rgb('--color-primary-500'),
          600: rgb('--color-primary-600'),
          700: rgb('--color-primary-700'),
          800: rgb('--color-primary-800'),
          900: rgb('--color-primary-900'),
          950: rgb('--color-primary-950'),
        },
        gray: {
          50: rgb('--color-gray-50'),
          100: rgb('--color-gray-100'),
          200: rgb('--color-gray-200'),
          300: rgb('--color-gray-300'),
          400: rgb('--color-gray-400'),
          500: rgb('--color-gray-500'),
          600: rgb('--color-gray-600'),
          700: rgb('--color-gray-700'),
          800: rgb('--color-gray-800'),
          900: rgb('--color-gray-900'),
          950: rgb('--color-gray-950'),
        },
        background: rgb('--ui-background'),
        foreground: rgb('--ui-foreground'),
      },
      maxWidth: {
        '7xl': '80rem',
        '8xl': '88rem'
      }
    }
  },
  plugins: []
}
