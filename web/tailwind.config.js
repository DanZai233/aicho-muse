/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: 'rgb(var(--paper) / <alpha-value>)',
        ink: 'rgb(var(--ink) / <alpha-value>)',
        accent: 'rgb(var(--accent) / <alpha-value>)',
        accentlight: 'rgb(var(--accentlight) / <alpha-value>)',
        surface: 'rgb(var(--surface) / <alpha-value>)',
      },
      fontFamily: {
        serif: ['"Noto Serif SC"', '"Songti SC"', 'Georgia', 'serif'],
        sans: ['"Noto Sans SC"', '"PingFang SC"', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        soft: '0 2px 16px rgba(45,42,38,0.06)',
        lift: '0 8px 30px rgba(45,42,38,0.10)',
      },
    },
  },
  plugins: [],
};
