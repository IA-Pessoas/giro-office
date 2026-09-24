import type { FormEvent } from "react";
import { useState } from "react";
import Head from "next/head";
import { isAxiosError } from "axios";
import { Lock, ShieldCheck } from "lucide-react";

import { canSSRGuest } from "@modules/auth";
import { useAuth } from "@/context/AuthContext";

export default function SuperAdminLoginPage() {
  const { signInPlatform } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      await signInPlatform({ email, password });
    } catch (loginError) {
      const tooManyAttempts = isAxiosError(loginError) && loginError.response?.status === 429;
      setError(
        tooManyAttempts
          ? "Muitas tentativas. Aguarde um minuto e tente novamente."
          : "E-mail ou senha inválidos.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Head>
        <title>Acesso de plataforma - Office</title>
      </Head>

      <main className="flex min-h-screen items-center justify-center bg-slate-950 p-4">
        <section className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-8 shadow-2xl">
          <ShieldCheck className="mb-5 h-10 w-10 text-emerald-400" aria-hidden="true" />
          <h1 className="text-2xl font-semibold text-white">Acesso de plataforma</h1>
          <p className="mt-2 text-sm text-slate-300">Use as credenciais de super administrador.</p>

          <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
            <label className="block text-sm font-medium text-slate-100" htmlFor="platform-email">
              E-mail
              <input
                autoComplete="username"
                className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-white outline-none focus:border-emerald-400"
                disabled={loading}
                id="platform-email"
                onChange={(event) => setEmail(event.target.value)}
                required
                type="email"
                value={email}
              />
            </label>

            <label className="block text-sm font-medium text-slate-100" htmlFor="platform-password">
              Senha
              <span className="relative mt-1 block">
                <Lock className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                <input
                  autoComplete="current-password"
                  className="w-full rounded-lg border border-slate-600 bg-slate-800 py-2 pr-3 pl-9 text-white outline-none focus:border-emerald-400"
                  disabled={loading}
                  id="platform-password"
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  type="password"
                  value={password}
                />
              </span>
            </label>

            {error ? <p className="text-sm text-rose-300" role="alert">{error}</p> : null}

            <button
              className="w-full rounded-lg bg-emerald-400 px-4 py-2 font-semibold text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={loading}
              type="submit"
            >
              {loading ? "Entrando..." : "Entrar"}
            </button>
          </form>
        </section>
      </main>
    </>
  );
}

export const getServerSideProps = canSSRGuest(async () => ({ props: {} }));
