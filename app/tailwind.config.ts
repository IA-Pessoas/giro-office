import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/modules/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/shared/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/context/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/utils/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        blue: {
          500: "var(--colors-blue-500)"
        },
        pink: {
          500: "var(--colors-pink-500)"
        },
        red: {
          400: "var(--colors-red-400)",
          700: "var(--colors-red-700)"
        }
      },
      spacing: {
        1: "var(--space-1)",
        2: "var(--space-2)",
        3: "var(--space-3)",
        4: "var(--space-4)",
        5: "var(--space-5)",
        6: "var(--space-6)"
      },
      borderRadius: {
        sm: "var(--radii-sm)",
        md: "var(--radii-md)",
        lg: "var(--radii-lg)",
        xl: "var(--radii-xl)",
        "2xl": "var(--radii-2xl)"
      },
      boxShadow: {
        sm: "var(--shadows-sm)",
        md: "var(--shadows-md)",
        lg: "var(--shadows-lg)"
      },
      keyframes: {
        blob: {
          "0%, 100%": { transform: "translate(0, 0) scale(1)" },
          "25%": { transform: "translate(20px, -50px) scale(1.1)" },
          "50%": { transform: "translate(-20px, 20px) scale(0.9)" },
          "75%": { transform: "translate(50px, 50px) scale(1.05)" }
        },
        "fade-in-right": {
          from: { opacity: "0", transform: "translateX(30px)" },
          to: { opacity: "1", transform: "translateX(0)" }
        },
        "fade-in-left": {
          from: { opacity: "0", transform: "translateX(-30px)" },
          to: { opacity: "1", transform: "translateX(0)" }
        },
        shake: {
          "0%, 100%": { transform: "translateX(0)" },
          "25%": { transform: "translateX(-5px)" },
          "75%": { transform: "translateX(5px)" }
        }
      },
      animation: {
        blob: "blob 7s infinite",
        "fade-in-right": "fade-in-right 0.6s ease-out forwards",
        "fade-in-left": "fade-in-left 0.6s ease-out forwards",
        shake: "shake 0.5s ease-in-out"
      }
    }
  },
  plugins: [
    function ({ addUtilities }) {
      addUtilities({
        ".animation-delay-2000": { "animation-delay": "2s" },
        ".animation-delay-4000": { "animation-delay": "4s" }
      });
    }
  ]
};

export default config;
