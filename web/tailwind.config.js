/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: '#faf7f2',
        ink: '#2d2a26',
        accent: '#8b7d6b',
        accentlight: '#e8e2d8',
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
