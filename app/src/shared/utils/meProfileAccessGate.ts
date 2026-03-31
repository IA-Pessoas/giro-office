/** sessionStorage: acesso à rota `/me` só após fluxo explícito (ex.: Configurações → Editar Perfil). */
const STORAGE_KEY = "@cw.me-profile-from-config";

export function grantMeProfileAccess(): void {
  if (typeof window === "undefined") {
    return;
  }
  sessionStorage.setItem(STORAGE_KEY, "1");
}

export function hasMeProfileAccess(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return sessionStorage.getItem(STORAGE_KEY) === "1";
}

/** Revoga o acesso à rota `/me` (ex.: ao sair da página por navegação interna). */
export function clearMeProfileAccess(): void {
  if (typeof window === "undefined") {
    return;
  }
  sessionStorage.removeItem(STORAGE_KEY);
}
