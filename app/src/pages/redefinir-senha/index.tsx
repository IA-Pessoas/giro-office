import { useEffect, useState, type FormEvent } from "react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { isAxiosError } from "axios";
import { KeyRound } from "lucide-react";

import { setupAPIClient } from "@shared/services/api";
import { MIN_PASSWORD_LENGTH } from "@shared/utils/meProfileUpdate";

const inputClass =
  "w-full mt-1 px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30";

function passwordError(password: string, confirmPassword: string): string | null {
  if (!password) return null;
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `A nova senha deve ter ao menos ${MIN_PASSWORD_LENGTH} caracteres.`;
  }
  if (password !== confirmPassword) return "As senhas não conferem.";
  return null;
}

/** Destino do link enviado pelo administrador (#1342). */
export default function RedefinirSenhaPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!router.isReady) return;
    const queryToken = router.query.token;
    setToken(typeof queryToken === "string" && queryToken ? queryToken : null);
    // Tira o token da barra de endereço e do histórico assim que ele é lido.
    window.history.replaceState(null, "", "/redefinir-senha");
  }, [router.isReady, router.query.token]);

  const validationError = passwordError(password, confirmPassword);
  const canSubmit =
    Boolean(token) && password.length > 0 && confirmPassword.length > 0 && !validationError;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit || !token) return;
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      await setupAPIClient().post("/user/password-reset/confirm", { token, password });
      setDone(true);
    } catch (error) {
      const message = isAxiosError(error) ? error.response?.data?.error : undefined;
      setSubmitError(
        typeof message === "string" ? message : "Não foi possível redefinir a senha.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <Head>
        <title>Redefinir senha - Office</title>
        <meta name="referrer" content="no-referrer" />
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl p-6 md:p-8 space-y-5">
          <div className="flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-blue-600" />
            <h1 className="text-2xl font-bold text-gray-900">Redefinir senha</h1>
          </div>

          {done ? (
            <div className="space-y-4">
              <p className="text-sm text-gray-700">
                Senha redefinida. Entre com a nova senha.
              </p>
              <Link href="/login" className="text-sm font-semibold text-blue-600 hover:underline">
                Ir para o login
              </Link>
            </div>
          ) : router.isReady && !token ? (
            <div className="space-y-4">
              <p className="text-sm text-gray-700">
                Link inválido. Peça ao administrador da sua empresa um novo link de redefinição.
              </p>
              <Link href="/login" className="text-sm font-semibold text-blue-600 hover:underline">
                Voltar ao login
              </Link>
            </div>
          ) : (
            <form className="space-y-4" onSubmit={(event) => void handleSubmit(event)}>
              <p className="text-sm text-gray-600">
                Escolha uma nova senha com ao menos {MIN_PASSWORD_LENGTH} caracteres. O link vale uma
                única vez.
              </p>
              <div>
                <label className="block text-sm font-medium text-gray-700" htmlFor="reset-password">
                  Nova senha
                </label>
                <input
                  id="reset-password"
                  className={inputClass}
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </div>
              <div>
                <label
                  className="block text-sm font-medium text-gray-700"
                  htmlFor="reset-confirm-password"
                >
                  Confirmar nova senha
                </label>
                <input
                  id="reset-confirm-password"
                  className={inputClass}
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  aria-describedby={validationError ? "reset-password-error" : undefined}
                />
                {validationError ? (
                  <p id="reset-password-error" className="mt-1 text-sm text-red-600">
                    {validationError}
                  </p>
                ) : null}
              </div>
              {submitError ? (
                <p className="text-sm text-red-600" role="alert">
                  {submitError}
                </p>
              ) : null}
              <button
                type="submit"
                className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                disabled={!canSubmit || isSubmitting}
              >
                {isSubmitting ? "Salvando…" : "Definir nova senha"}
              </button>
            </form>
          )}
        </div>
      </div>
    </>
  );
}
