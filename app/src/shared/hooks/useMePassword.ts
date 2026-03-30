import { useEffect, useState } from "react";

import { setupAPIClient } from "@shared/services/api";

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

    const client = setupAPIClient();
    let cancelled = false;

    client
      .get("/me")
      .then((res) => {
        if (!cancelled && res.data?.user?.password != null) {
          setPassword(String(res.data.user.password));
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [userId]);

  return { password, setPassword };
}
