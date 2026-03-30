// components/ToggleThemeButton.tsx
import { useEffect, useState } from "react";
import { FiMoon, FiSun } from "react-icons/fi";
import Cookie from "js-cookie";

export function ToggleThemeButton() {
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const htmlTheme = document.documentElement.getAttribute("data-theme");
    if (htmlTheme === "dark" || htmlTheme === "light") {
      setTheme(htmlTheme);
      return;
    }

    const cookieTheme = Cookie.get("chakra-ui-color-mode");
    if (cookieTheme === "dark" || cookieTheme === "light") {
      setTheme(cookieTheme);
      document.documentElement.setAttribute("data-theme", cookieTheme);
    }
  }, []);

  const handleToggleTheme = () => {
    const nextTheme = theme === "light" ? "dark" : "light";
    setTheme(nextTheme);
    document.documentElement.setAttribute("data-theme", nextTheme);
    Cookie.set("chakra-ui-color-mode", nextTheme, {
      expires: 365,
      path: "/"
    });
  };

  return (
    <button
      type="button"
      aria-label="Alternar tema"
      onClick={handleToggleTheme}
      className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-700 transition-colors hover:bg-slate-100"
    >
      {theme === "light" ? <FiMoon /> : <FiSun />}
    </button>
  );
}