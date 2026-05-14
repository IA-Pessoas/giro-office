import Cookie from "js-cookie";

export type AppTheme = "light" | "dark";

export function applyTheme(theme: AppTheme) {
  if (typeof window === "undefined") {
    return;
  }

  const root = document.documentElement;
  root.classList.remove("light", "dark");
  root.classList.add(theme);
  root.setAttribute("data-theme", theme);

  localStorage.setItem("workspace-theme", theme);
  localStorage.setItem("chakra-ui-color-mode", theme);

  Cookie.set("chakra-ui-color-mode", theme, {
    expires: 365,
    path: "/",
  });
}

export function getCurrentTheme(): AppTheme {
  if (typeof window === "undefined") {
    return "light";
  }

  const root = document.documentElement;
  const dataTheme = root.getAttribute("data-theme");

  if (dataTheme === "dark" || dataTheme === "light") {
    return dataTheme;
  }

  if (root.classList.contains("dark")) {
    return "dark";
  }

  const storedWorkspaceTheme = localStorage.getItem("workspace-theme");
  if (storedWorkspaceTheme === "dark" || storedWorkspaceTheme === "light") {
    return storedWorkspaceTheme;
  }

  const storedLegacyTheme = localStorage.getItem("chakra-ui-color-mode");
  if (storedLegacyTheme === "dark" || storedLegacyTheme === "light") {
    return storedLegacyTheme;
  }

  return "light";
}
