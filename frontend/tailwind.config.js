/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#080b16",
          900: "#0a0e1f",
          800: "#10162d",
          700: "#1a2140",
          600: "#252e55",
          500: "#3a4576",
        },
        mist: {
          100: "rgba(255,255,255,0.96)",
          200: "rgba(255,255,255,0.82)",
          300: "rgba(255,255,255,0.65)",
          400: "rgba(255,255,255,0.46)",
          500: "rgba(255,255,255,0.30)",
          600: "rgba(255,255,255,0.18)",
          700: "rgba(255,255,255,0.10)",
          800: "rgba(255,255,255,0.06)",
          900: "rgba(255,255,255,0.03)",
        },
        tide: "#7fd3dd",
        dusk: "#aeb9d6",
        aurora: "#9fb4f0",
        lighthouse: "#f5d28a",
        coral: "#f0a08a",
        shell: "#f4f1d0",
      },
      fontFamily: {
        sans: ['"PingFang SC"', '"Hiragino Sans GB"', '"Microsoft YaHei"', "system-ui", "sans-serif"],
        serif: ['"Fraunces"', '"Cormorant Garamond"', '"Source Han Serif SC"', '"Noto Serif SC"', '"Songti SC"', "serif"],
        display: ['"Fraunces"', '"Source Han Serif SC"', '"Noto Serif SC"', '"Songti SC"', "serif"],
        hand: ['"Caveat"', '"Kaiti SC"', "cursive"],
      },
      fontSize: {
        caption: ["11px", { lineHeight: "1.5em", letterSpacing: "0.18em" }],
        meta: ["12px", { lineHeight: "1.6em" }],
        body: ["14px", { lineHeight: "1.7em" }],
        reading: ["16px", { lineHeight: "2em", letterSpacing: "0.01em" }],
        "title-sm": ["18px", { lineHeight: "1.4em", letterSpacing: "0.1em" }],
        title: ["24px", { lineHeight: "1.3em", letterSpacing: "0.18em" }],
        display: ["32px", { lineHeight: "1.2em", letterSpacing: "0.4em", fontWeight: "300" }],
      },
      borderRadius: {
        xs: "6px",
        sm: "10px",
        md: "14px",
        tile: "14px",
        card: "20px",
        "card-lg": "28px",
        pill: "9999px",
      },
      spacing: {
        "stack-xs": "8px",
        "stack-sm": "12px",
        "stack-md": "20px",
        "stack-lg": "32px",
        "stack-xl": "48px",
        "cta-x": "1.5rem",
        "cta-y": "0.625rem",
      },
      boxShadow: {
        "glass-1":
          "0 1px 0 0 rgba(255,255,255,0.06) inset, 0 8px 24px -12px rgba(8,12,28,0.5)",
        "glass-2":
          "0 1px 0 0 rgba(255,255,255,0.12) inset, 0 -1px 0 0 rgba(255,255,255,0.04) inset, 0 24px 60px -20px rgba(8,12,28,0.55), 0 8px 24px -12px rgba(8,12,28,0.4)",
        "glass-3":
          "0 1px 0 0 rgba(255,255,255,0.18) inset, 0 32px 80px -24px rgba(8,12,28,0.7)",
        "glow-aurora": "0 8px 24px -8px rgba(159,180,240,0.45)",
        "glow-tide": "0 0 24px rgba(127,211,221,0.35)",
        "glow-lighthouse": "0 0 32px rgba(245,210,138,0.4)",
      },
      backdropBlur: {
        glass: "14px",
        "glass-strong": "28px",
      },
      backgroundImage: {
        "glass-sheen":
          "linear-gradient(180deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0) 38%)",
        noise: "url('/noise.svg')",
      },
      transitionTimingFunction: {
        "out-expo": "cubic-bezier(0.22, 1, 0.36, 1)",
        "out-quint": "cubic-bezier(0.16, 1, 0.3, 1)",
        "out-back": "cubic-bezier(0.34, 1.56, 0.64, 1)",
        "in-out-quart": "cubic-bezier(0.76, 0, 0.24, 1)",
      },
      keyframes: {
        tide: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-4px)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        breathe: {
          "0%, 100%": { opacity: "0.35" },
          "50%": { opacity: "1" },
        },
      },
      animation: {
        tide: "tide 6s ease-in-out infinite",
        shimmer: "shimmer 3.2s linear infinite",
        breathe: "breathe 4.5s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
