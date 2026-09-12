import type { Config } from "tailwindcss";

/**
 * Tokens are CSS custom properties holding space-separated RGB channels, so Tailwind's
 * opacity modifiers (`bg-surface/60`) still resolve. Every value is defined once in
 * globals.css; no component may reach for a literal hex.
 *
 * Dark is the only theme. There is no light variant by design - it would be unused and
 * would double the surface area for bugs.
 */
const c = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: c("bg"),
        surface: c("surface"),
        border: c("border"),
        "border-strong": c("border-strong"),
        divider: c("divider"),

        text: c("text"),
        muted: c("text-muted"),

        wheat: c("wheat"),
        "wheat-on": c("wheat-on"),
        "wheat-tint": c("wheat-tint"),
        "wheat-edge": c("wheat-edge"),
        "wheat-text": c("wheat-text"),

        good: c("good"),
        "good-bg": c("good-bg"),
        "good-edge": c("good-edge"),
        bad: c("bad"),
        connector: c("connector"),
        "art-ctx": c("art-ctx"),

        // `stone` is used across screens inherited from the previous design. Pointing
        // the ramp at these tokens keeps every screen coherent while they are converted,
        // rather than leaving half the app on an orphaned palette.
        stone: {
          50: c("s-50"),
          100: c("s-100"),
          200: c("s-200"),
          300: c("s-300"),
          400: c("text-muted"),
          500: c("s-500"),
          600: c("s-600"),
          700: c("border-strong"),
          800: c("border"),
          900: c("surface"),
          950: c("bg"),
        },
        red: { 300: c("bad"), 400: c("bad"), 500: c("bad") },

        // Retained aliases from the previous palette.
        grain: c("wheat"),
        sprout: c("good"),
        soil: c("bg"),
      },
      fontFamily: {
        sans: ["Satoshi", "ui-sans-serif", "system-ui", "-apple-system", "sans-serif"],
        // Addresses, tx hashes and hex commitments have to be read character by
        // character on video, and to line up in columns.
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      borderRadius: {
        card: "14px",
        pill: "999px",
      },
      fontSize: {
        label: ["12px", { lineHeight: "16px" }],
        metric: ["25px", { lineHeight: "30px", letterSpacing: "-0.01em" }],
        focal: ["34px", { lineHeight: "38px", letterSpacing: "-0.02em" }],
        hero: ["42px", { lineHeight: "46px", letterSpacing: "-0.025em" }],
      },
    },
  },
  plugins: [],
};

export default config;
