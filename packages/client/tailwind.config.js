/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: {
          0: '#1e1e1e',
          1: '#252526',
          2: '#2d2d30',
          3: '#3e3e42',
        },
        accent: {
          DEFAULT: '#007acc',
          hover: '#1a8ad4',
        },
        border: '#404040',
      },
    },
  },
  plugins: [],
}
