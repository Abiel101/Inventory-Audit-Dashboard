/** @type {import('tailwindcss').Config} */
const scale = (name, steps) => Object.fromEntries(steps.map((step) => [step, `rgb(var(--${name}-${step}) / <alpha-value>)`]));

module.exports = {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        white: "rgb(var(--surface) / <alpha-value>)",
        slate: scale("slate", [50, 100, 200, 300, 400, 500, 600, 700, 800, 900]),
        sky: scale("sky", [50, 100, 200, 400, 500, 600, 700, 800]),
        sidebar: {
          DEFAULT: "rgb(var(--surface) / <alpha-value>)",
          foreground: "rgb(var(--slate-600) / <alpha-value>)",
          primary: "rgb(var(--sky-600) / <alpha-value>)",
          "primary-foreground": "rgb(var(--surface) / <alpha-value>)",
          accent: "rgb(var(--sky-50) / <alpha-value>)",
          "accent-foreground": "rgb(var(--sky-700) / <alpha-value>)",
          border: "rgb(var(--slate-200) / <alpha-value>)",
          ring: "rgb(var(--sky-500) / <alpha-value>)",
        },
      },
    },
  },
  plugins: [],
}
