/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        ink: {
          50: '#fdf8f0',
          100: '#faefd8',
          200: '#f3d9a8',
          300: '#eabd72',
          400: '#e09a3a',
          500: '#d97706',
          600: '#b45309',
          700: '#92400e',
          800: '#78350f',
          900: '#451a03',
        },
      },
      fontFamily: {
        sans: ['PingFang SC', 'Microsoft YaHei', 'sans-serif'],
        serif: ['Noto Serif SC', 'SimSun', 'serif'],
      },
      typography: {
        DEFAULT: {
          css: { maxWidth: 'none' },
        },
      },
    },
  },
  plugins: [],
};
