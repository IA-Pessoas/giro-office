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
      }
    }
  },
  plugins: []
};

export default config;
