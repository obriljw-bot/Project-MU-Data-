/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#0070C0', // Excel Blue
          dark: '#005a9e',
          light: '#e6f2ff',
        },
        secondary: {
          DEFAULT: '#C00000', // Excel Red
          dark: '#9e0000',
          light: '#ffe6e6',
        },
        surface: {
            DEFAULT: '#ffffff',
            muted: '#f8fafc',
        }
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
