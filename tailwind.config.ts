import type { Config } from "tailwindcss";

/**
 * Tailwind theme for Mariposa. Color tokens resolve to OKLCH custom properties
 * defined in app/globals.css. Each token is wrapped so utilities like
 * `bg-primary/80` apply alpha through the <alpha-value> slot.
 */
function oklchVar(token: string): string {
  return `oklch(var(${token}) / <alpha-value>)`;
}

const config: Config = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        border: oklchVar("--border"),
        input: oklchVar("--input"),
        ring: oklchVar("--ring"),
        background: oklchVar("--background"),
        foreground: oklchVar("--foreground"),
        primary: {
          DEFAULT: oklchVar("--primary"),
          foreground: oklchVar("--primary-foreground"),
        },
        secondary: {
          DEFAULT: oklchVar("--secondary"),
          foreground: oklchVar("--secondary-foreground"),
        },
        destructive: {
          DEFAULT: oklchVar("--destructive"),
          foreground: oklchVar("--destructive-foreground"),
        },
        success: {
          DEFAULT: oklchVar("--success"),
          foreground: oklchVar("--success-foreground"),
        },
        warning: {
          DEFAULT: oklchVar("--warning"),
          foreground: oklchVar("--warning-foreground"),
        },
        info: {
          DEFAULT: oklchVar("--info"),
          foreground: oklchVar("--info-foreground"),
        },
        muted: {
          DEFAULT: oklchVar("--muted"),
          foreground: oklchVar("--muted-foreground"),
        },
        accent: {
          DEFAULT: oklchVar("--accent"),
          foreground: oklchVar("--accent-foreground"),
        },
        popover: {
          DEFAULT: oklchVar("--popover"),
          foreground: oklchVar("--popover-foreground"),
        },
        card: {
          DEFAULT: oklchVar("--card"),
          foreground: oklchVar("--card-foreground"),
        },
      },
      borderRadius: {
        "2xl": "calc(var(--radius) + 4px)",
        xl: "var(--radius)",
        lg: "calc(var(--radius) - 4px)",
        md: "calc(var(--radius) - 8px)",
        sm: "calc(var(--radius) - 10px)",
      },
      /* Semantic z-index scale — never arbitrary 999 values. */
      zIndex: {
        header: "30",
        tabs: "40",
        overlay: "50",
        modal: "60",
        toast: "70",
      },
      boxShadow: {
        card: "0 1px 2px oklch(0.26 0.018 345 / 0.04), 0 8px 24px -12px oklch(0.26 0.018 345 / 0.12)",
        tabs: "0 -1px 0 oklch(0.92 0.008 345 / 1), 0 -8px 24px -16px oklch(0.26 0.018 345 / 0.16)",
        header: "0 1px 0 oklch(0.92 0.008 345 / 1)",
      },
      keyframes: {
        "rise": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        rise: "rise 420ms cubic-bezier(0.22, 1, 0.36, 1) both",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
