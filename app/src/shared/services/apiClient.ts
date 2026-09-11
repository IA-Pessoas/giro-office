import { readBrowserCookie, setupAPIClient } from "./api";
import { signOut } from "../../context/AuthContext";

export const api = setupAPIClient(undefined, () => {
  if (readBrowserCookie("cw.csrf")) {
    signOut();
  }
}, () => {
  signOut("Sua sessão de segurança expirou. Faça login novamente.");
});
