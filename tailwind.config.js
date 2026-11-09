/** @type {import('tailwindcss').Config} */
const scale = (name, steps) => Object.fromEntries(steps.map((step) => [step, `rgb(var(--${name}-${step}) / <alpha-value>)`]));
const token = (name) => `rgb(var(--${name}) / <alpha-value>)`;

// Every color below resolves to the active theme's CSS variables (see src/index.css).
module.exports = {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        white: token("surface"),
        slate: scale("slate", [50, 100, 200, 300, 400, 500, 600, 700, 800, 900]),
        sky: scale("sky", [50, 100, 200, 400, 500, 600, 700, 800]),
        background: token("surface"),
        foreground: token("slate-900"),
        border: token("slate-200"),
        input: token("slate-300"),
        ring: token("sky-500"),
        primary: { DEFAULT: token("sky-600"), foreground: token("surface") },
        secondary: { DEFAULT: token("slate-100"), foreground: token("slate-900") },
        muted: { DEFAULT: token("slate-100"), foreground: token("slate-500") },
        accent: { DEFAULT: token("slate-100"), foreground: token("slate-900") },
        popover: { DEFAULT: token("surface"), foreground: token("slate-900") },
        sidebar: {
          DEFAULT: token("surface"),
          foreground: token("slate-600"),
          primary: token("sky-600"),
          "primary-foreground": token("surface"),
          accent: token("sky-50"),
          "accent-foreground": token("sky-700"),
          border: token("slate-200"),
          ring: token("sky-500"),
        },
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}
