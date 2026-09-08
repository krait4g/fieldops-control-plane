import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        shell: {
          bg: "#F4F7FB",
          surface: "#FFFFFF",
        },
        console: {
          bg: "#08111F",
          "surface-1": "#0F1A2B",
          "surface-2": "#162337",
        },
        border: {
          subtle: "#26354A",
        },
        text: {
          primary: "#F8FAFC",
          secondary: "#A7B4C6",
          muted: "#94A3B8",
        },
        accent: {
          primary: "#7AA2FF",
          hover: "#91B2FF",
        },
        status: {
          success: "#22C55E",
          warning: "#F59E0B",
          critical: "#FF6B6B",
          info: "#38BDF8",
          unknown: "#A78BFA",
        },
      },
    },
  },
  plugins: [],
};

export default config;
