import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        grain: "#d9a441",
        soil: "#1c1917",
        sprout: "#4d7c0f",
      },
    },
  },
  plugins: [],
};

export default config;
