// components/ToggleThemeButton.tsx
import { useEffect, useState } from "react";
import { FiMoon, FiSun } from "react-icons/fi";
import { applyTheme, getCurrentTheme } from "@shared/utils/theme";

export function ToggleThemeButton() {
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const currentTheme = getCurrentTheme();
    setTheme(currentTheme);
    applyTheme(currentTheme);
  }, []);

  const handleToggleTheme = () => {
    const nextTheme = theme === "light" ? "dark" : "light";
    setTheme(nextTheme);
    applyTheme(nextTheme);
  };

  return (
    <button
      type="button"
      aria-label="Alternar tema"
      onClick={handleToggleTheme}
      className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
    >
      {theme === "light" ? <FiMoon /> : <FiSun />}
    </button>
  );
}
