import { useEffect, useState } from "react";
import { getMe } from "@workspace/api";

import { api } from "@shared/services/apiClient";

/**
 * Carrega o valor inicial do campo de senha a partir de GET /me (quando a API expõe `user.password`).
 * Usa cancelamento no cleanup para evitar setState após unmount ou troca de usuário.
 */
export function useMePassword(userId: string | undefined) {
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (!userId) {
      return;
    }

    let cancelled = false;

    getMe(api)
      .then((sessionUser) => {
        if (!cancelled && sessionUser.password != null) {
          setPassword(String(sessionUser.password));
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [userId]);

  return { password, setPassword };
}
