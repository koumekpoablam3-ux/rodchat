import type { Config } from "tailwindcss";

// Les couleurs viennent de variables CSS (voir globals.css) : le mode sombre
// change les valeurs sans toucher aux classes.
const token = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: token("bg"),
        panel: token("panel"),
        chat: token("chat"),
        ink: token("ink"),
        muted: token("muted"),
        line: token("line"),
        brand: token("brand"),
        "brand-ink": token("brand-ink"),
        accent: token("accent"),
        "accent-ink": token("accent-ink"),
        "bubble-in": token("bubble-in"),
        "bubble-out": token("bubble-out"),
        "bubble-out-ink": token("bubble-out-ink"),
        danger: token("danger"),
      },
      fontFamily: {
        sans: ['"Figtree Variable"', "system-ui", "sans-serif"],
        display: ['"Bricolage Grotesque Variable"', '"Figtree Variable"', "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
