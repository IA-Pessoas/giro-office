// components/ToggleThemeButton.tsx
import { IconButton, useColorMode } from "@chakra-ui/react";
import { MoonIcon, SunIcon } from "@chakra-ui/icons";
import Cookie from "js-cookie";

export function ToggleThemeButton() {
  const { colorMode, toggleColorMode } = useColorMode();
  
  const handleToggleTheme = () => {
    toggleColorMode();
    Cookie.set("chakra-ui-color-mode", colorMode === "light" ? "dark" : "light", {
      expires: 365,
      path: "/"
    });
    toggleColorMode()
  };

  return (
    <IconButton
      aria-label="Alternar tema"
      icon={colorMode === "light" ? <MoonIcon /> : <SunIcon />}
      onClick={handleToggleTheme}
      variant="ghost"
      size="md"
    />
  );
}