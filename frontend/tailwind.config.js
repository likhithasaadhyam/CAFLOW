/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        caflow: {
          primary: '#176B57', // Deep forest green
          'primary-hover': '#135847',
          'primary-light': '#E8F3EF',
          secondary: '#202A33', // Dark charcoal
          accent: '#DDAA45', // Muted amber
          'accent-light': '#FBF5E6',
          bg: '#F7F8F5', // Warm off-white
          card: '#FFFFFF',
          text: '#263238', // Dark slate
          muted: '#607274',
          border: '#E1E7E2', // Light grey-green
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      boxShadow: {
        subtle: '0 1px 3px 0 rgba(0, 0, 0, 0.05), 0 1px 2px 0 rgba(0, 0, 0, 0.03)',
        card: '0 4px 6px -1px rgba(23, 107, 87, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03)',
        elevated: '0 10px 15px -3px rgba(32, 42, 51, 0.08), 0 4px 6px -2px rgba(0, 0, 0, 0.03)',
      },
    },
  },
  plugins: [],
}
