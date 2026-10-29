import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./client/index.html", "./client/src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      borderRadius: {
        // Warm studio: softer corners. 10 for buttons and inputs (rounded-md), 16 for cards and dialogs (lg, xl).
        xl: "1rem", /* 16px */
        lg: "1rem", /* 16px */
        md: ".625rem", /* 10px */
        sm: ".375rem", /* 6px */
      },
      colors: {
        // Silverleaf redesign tokens (client/src/index.css --sl-*): bg-sl-ground, text-sl-muted, border-sl-line, ...
        sl: {
          "ground": "rgb(var(--sl-ground) / <alpha-value>)",
          "surface": "rgb(var(--sl-surface) / <alpha-value>)",
          "nav": "rgb(var(--sl-nav) / <alpha-value>)",
          "line": "rgb(var(--sl-line) / <alpha-value>)",
          "control": "rgb(var(--sl-control) / <alpha-value>)",
          "ink": "rgb(var(--sl-ink) / <alpha-value>)",
          "muted": "rgb(var(--sl-muted) / <alpha-value>)",
          "accent": "rgb(var(--sl-accent) / <alpha-value>)",
          "accent-strong": "rgb(var(--sl-accent-strong) / <alpha-value>)",
          "accent-soft": "rgb(var(--sl-accent-soft) / <alpha-value>)",
          "risk": "rgb(var(--sl-risk) / <alpha-value>)",
          "risk-soft": "rgb(var(--sl-risk-soft) / <alpha-value>)",
          "attention": "rgb(var(--sl-attention) / <alpha-value>)",
          "attention-soft": "rgb(var(--sl-attention-soft) / <alpha-value>)",
          "done": "rgb(var(--sl-done) / <alpha-value>)",
          "done-soft": "rgb(var(--sl-done-soft) / <alpha-value>)",
          "neutral": "rgb(var(--sl-neutral) / <alpha-value>)",
          "neutral-soft": "rgb(var(--sl-neutral-soft) / <alpha-value>)",
        },
        // Flat / base colors (regular buttons)
        background: "hsl(var(--background) / <alpha-value>)",
        foreground: "hsl(var(--foreground) / <alpha-value>)",
        border: "hsl(var(--border) / <alpha-value>)",
        input: "hsl(var(--input) / <alpha-value>)",
        card: {
          DEFAULT: "hsl(var(--card) / <alpha-value>)",
          foreground: "hsl(var(--card-foreground) / <alpha-value>)",
          border: "hsl(var(--card-border) / <alpha-value>)",
        },
        popover: {
          DEFAULT: "hsl(var(--popover) / <alpha-value>)",
          foreground: "hsl(var(--popover-foreground) / <alpha-value>)",
          border: "hsl(var(--popover-border) / <alpha-value>)",
        },
        primary: {
          DEFAULT: "hsl(var(--primary) / <alpha-value>)",
          foreground: "hsl(var(--primary-foreground) / <alpha-value>)",
          border: "var(--primary-border)",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary) / <alpha-value>)",
          foreground: "hsl(var(--secondary-foreground) / <alpha-value>)",
          border: "var(--secondary-border)",
        },
        muted: {
          DEFAULT: "hsl(var(--muted) / <alpha-value>)",
          foreground: "hsl(var(--muted-foreground) / <alpha-value>)",
          border: "var(--muted-border)",
        },
        accent: {
          DEFAULT: "hsl(var(--accent) / <alpha-value>)",
          foreground: "hsl(var(--accent-foreground) / <alpha-value>)",
          border: "var(--accent-border)",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive) / <alpha-value>)",
          foreground: "hsl(var(--destructive-foreground) / <alpha-value>)",
          border: "var(--destructive-border)",
        },
        ring: "hsl(var(--ring) / <alpha-value>)",
        chart: {
          "1": "hsl(var(--chart-1) / <alpha-value>)",
          "2": "hsl(var(--chart-2) / <alpha-value>)",
          "3": "hsl(var(--chart-3) / <alpha-value>)",
          "4": "hsl(var(--chart-4) / <alpha-value>)",
          "5": "hsl(var(--chart-5) / <alpha-value>)",
        },
        sidebar: {
          ring: "hsl(var(--sidebar-ring) / <alpha-value>)",
          DEFAULT: "hsl(var(--sidebar) / <alpha-value>)",
          foreground: "hsl(var(--sidebar-foreground) / <alpha-value>)",
          border: "hsl(var(--sidebar-border) / <alpha-value>)",
        },
        "sidebar-primary": {
          DEFAULT: "hsl(var(--sidebar-primary) / <alpha-value>)",
          foreground: "hsl(var(--sidebar-primary-foreground) / <alpha-value>)",
          border: "var(--sidebar-primary-border)",
        },
        "sidebar-accent": {
          DEFAULT: "hsl(var(--sidebar-accent) / <alpha-value>)",
          foreground: "hsl(var(--sidebar-accent-foreground) / <alpha-value>)",
          border: "var(--sidebar-accent-border)"
        },
        status: {
          online: "rgb(34 197 94)",
          away: "rgb(245 158 11)",
          busy: "rgb(239 68 68)",
          offline: "rgb(156 163 175)",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)"],
        serif: ["var(--font-serif)"],
        mono: ["var(--font-mono)"],
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate"), require("@tailwindcss/typography")],
} satisfies Config;
