import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        hud: {
          bg: "#0D191C",
          surface: "#101F23",
          card: "#15282C",
          "card-hover": "#1C332E",
          item: "#233A3D",
          border: "#294044",
          "border-bright": "#3E5556",
          teal: "#0EB29A",
          "teal-dark": "#097364",
          lime: "#DDF0C2",
          "lime-muted": "#B5C4BE",
          muted: "#8C999A",
          text: "#F5FDFF",
          danger: "#FF4444",
          "danger-bg": "#2D0A0A",
          safe: "#4ADE80",
          "safe-bg": "#0D2B1A",
          warning: "#F5C518",
        },
      },
      fontFamily: {
        mono: ["var(--font-jetbrains-mono)", "ui-monospace", "SFMono-Regular", "Menlo", "Monaco", "Consolas", "monospace"],
        sans: ["var(--font-geist-sans)", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "Roboto", "sans-serif"],
      },
      boxShadow: {
        hud: "0 0 20px rgba(14, 178, 154, 0.15)",
        "hud-glow": "0 0 25px rgba(221, 240, 194, 0.2)",
      },
    },
  },
  plugins: [],
};

export default config;

