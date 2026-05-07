import { useContext, useState } from "react";
import type { FormEvent } from "react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import {
  AlertCircle,
  ArrowRight,
  Lock,
  Mail,
  Shield,
  Sparkles,
  Users,
} from "lucide-react";

import { canSSRGuest } from "@modules/auth";
import { AuthContext } from "../../context/AuthContext";

const LOGIN_CARD_PRIMARY_TEXT_CLASSNAME = "text-[#111827]";
const LOGIN_CARD_SECONDARY_TEXT_CLASSNAME = "text-[#4b5563]";
const LOGIN_CARD_LABEL_TEXT_CLASSNAME = "text-[#374151]";

export default function Login() {
  const { signIn } = useContext(AuthContext);
  const router = useRouter();

  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);

  const features = [
    {
      icon: Users,
      title: "Gestao Integrada",
      description: "Todos os departamentos em um so lugar",
    },
    {
      icon: Shield,
      title: "Seguranca Total",
      description: "Seus dados protegidos com criptografia",
    },
  ];

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    if (!login || !password) {
      setError("Por favor, preencha todos os campos");
      setLoading(false);
      return;
    }

    try {
      await signIn({ login, password });
      // Em geral o fluxo ja redireciona, mas garantimos um destino padrao.
      if (router.pathname === "/login") {
        await router.push("/dashboard");
      }
    } catch (error: any) {
      if (error?.response?.status === 400 || error?.response?.status === 401) {
        setError("Login ou senha invalidos");
      } else {
        setError("Nao foi possivel entrar agora. Tente novamente.");
      }
      setLogin("");
      setPassword("");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Head>
        <title>Login - Office</title>
      </Head>

      <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 p-4">
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -top-40 -left-40 h-80 w-80 animate-blob rounded-full bg-blue-400 opacity-70 mix-blend-overlay blur-3xl filter" />
          <div className="absolute -top-40 -right-40 h-80 w-80 animate-blob rounded-full bg-indigo-400 opacity-70 mix-blend-overlay blur-3xl filter animation-delay-2000" />
          <div className="absolute -bottom-40 left-20 h-80 w-80 animate-blob rounded-full bg-blue-300 opacity-70 mix-blend-overlay blur-3xl filter animation-delay-4000" />
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAxMCAwIEwgMCAwIDAgMTAiIGZpbGw9Im5vbmUiIHN0cm9rZT0id2hpdGUiIHN0cm9rZS13aWR0aD0iMC41IiBvcGFjaXR5PSIwLjEiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9InVybCgjZ3JpZCkiLz48L3N2Zz4=')] opacity-20" />
        </div>

        <div className="relative z-10 w-full max-w-6xl">
          <div className="grid items-center gap-6 lg:grid-cols-2">
            <div className="hidden flex-col justify-center space-y-6 text-white animate-fade-in-left lg:flex">
              <div className="space-y-4">
                <div className="inline-flex items-center gap-4 rounded-2xl bg-white p-3 shadow-2xl">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-blue-600">
                      <span className="text-xs font-bold text-white">OF</span>
                    </div>
                    <span className={`text-xl font-bold tracking-tight ${LOGIN_CARD_PRIMARY_TEXT_CLASSNAME}`}>
                      Office
                    </span>
                  </div>
                </div>

                <div className="space-y-2">
                  <h1 className="text-4xl font-bold leading-tight">
                    Gerencie tudo em
                    <br />
                    <span className="text-blue-200">um so lugar</span>
                  </h1>
                  <p className="text-base text-blue-100">
                    Sistema completo de gestao empresarial modular e inteligente
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                {features.map((feature, index) => {
                  const Icon = feature.icon;
                  return (
                    <div
                      key={feature.title}
                      className="flex items-start gap-3 rounded-xl border border-white/20 bg-white/10 p-3 backdrop-blur-sm transition-all duration-300 hover:bg-white/15 animate-fade-in-left"
                      style={{ animationDelay: `${index * 150}ms` }}
                    >
                      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-white/20">
                        <Icon className="h-5 w-5" />
                      </div>
                      <div>
                        <h3 className="mb-0.5 text-sm font-semibold">{feature.title}</h3>
                        <p className="text-xs leading-relaxed text-blue-100">{feature.description}</p>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-xl border border-white/20 bg-white/10 p-3 text-center backdrop-blur-sm">
                  <div className="mb-0.5 text-2xl font-bold">6</div>
                  <div className="text-xs text-blue-100">Modulos</div>
                </div>
                <div className="rounded-xl border border-white/20 bg-white/10 p-3 text-center backdrop-blur-sm">
                  <div className="mb-0.5 text-2xl font-bold">99.9%</div>
                  <div className="text-xs text-blue-100">Uptime</div>
                </div>
                <div className="rounded-xl border border-white/20 bg-white/10 p-3 text-center backdrop-blur-sm">
                  <div className="mb-0.5 text-2xl font-bold">24/7</div>
                  <div className="text-xs text-blue-100">Suporte</div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-center animate-fade-in-right">
              <div className="absolute top-6 left-1/2 -translate-x-1/2 lg:hidden">
                <div className="inline-flex items-center justify-center gap-3 rounded-2xl bg-white p-3 shadow-2xl">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-blue-600">
                      <span className="text-xs font-bold text-white">OF</span>
                    </div>
                    <span className={`text-xl font-bold tracking-tight ${LOGIN_CARD_PRIMARY_TEXT_CLASSNAME}`}>
                      Office
                    </span>
                  </div>
                </div>
              </div>

              <div className="relative mt-20 w-full max-w-md overflow-hidden rounded-3xl bg-white p-6 shadow-2xl dark:bg-white md:p-8 lg:mt-0">
                <div className="absolute top-0 right-0 h-32 w-32 rounded-bl-full bg-gradient-to-br from-blue-500 to-indigo-600 opacity-10" />

                <div className="relative z-10">
                  <div className={`mb-5 ${LOGIN_CARD_PRIMARY_TEXT_CLASSNAME}`}>
                    <div className="mb-2 flex items-center gap-2">
                      <Sparkles className="h-5 w-5 text-blue-600" />
                      <h2 className="bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-2xl font-bold text-transparent">
                        Bem-vindo
                      </h2>
                    </div>
                    <p className={`text-sm ${LOGIN_CARD_SECONDARY_TEXT_CLASSNAME}`}>
                      Entre com suas credenciais para acessar
                    </p>
                  </div>

                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="group">
                      <label
                        htmlFor="login"
                        className={`mb-1.5 block text-sm font-semibold ${LOGIN_CARD_LABEL_TEXT_CLASSNAME}`}
                      >
                        Login
                      </label>
                      <div
                        className={`rounded-xl border-2 bg-white transition-all duration-200 ease-out ${
                          focusedField === "login"
                            ? "border-[#4f8ff7] shadow-[0_0_0_3px_rgba(79,143,247,0.14)]"
                            : "border-gray-200"
                        }`}
                      >
                        <div className="relative">
                          <Mail
                            className={`absolute top-1/2 left-3 h-5 w-5 -translate-y-1/2 transition-colors duration-200 ease-out ${
                              focusedField === "login" ? "text-[#4f8ff7]" : "text-gray-400"
                            }`}
                          />
                          <input
                            id="login"
                            type="text"
                            value={login}
                            onChange={(e) => setLogin(e.target.value)}
                            onFocus={() => setFocusedField("login")}
                            onBlur={() => setFocusedField(null)}
                            placeholder="Digite seu login"
                            className={`login-input w-full rounded-xl border-0 bg-transparent py-2.5 pr-4 pl-11 text-sm placeholder:text-[#9ca3af] focus:outline-none ${LOGIN_CARD_PRIMARY_TEXT_CLASSNAME}`}
                            disabled={loading}
                            autoComplete="username"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="group">
                      <label
                        htmlFor="password"
                        className={`mb-1.5 block text-sm font-semibold ${LOGIN_CARD_LABEL_TEXT_CLASSNAME}`}
                      >
                        Senha
                      </label>
                      <div
                        className={`rounded-xl border-2 bg-white transition-all duration-200 ease-out ${
                          focusedField === "password"
                            ? "border-[#4f8ff7] shadow-[0_0_0_3px_rgba(79,143,247,0.14)]"
                            : "border-gray-200"
                        }`}
                      >
                        <div className="relative">
                          <Lock
                            className={`absolute top-1/2 left-3 h-5 w-5 -translate-y-1/2 transition-colors duration-200 ease-out ${
                              focusedField === "password" ? "text-[#4f8ff7]" : "text-gray-400"
                            }`}
                          />
                          <input
                            id="password"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            onFocus={() => setFocusedField("password")}
                            onBlur={() => setFocusedField(null)}
                            placeholder="••••••••"
                            className={`login-input w-full rounded-xl border-0 bg-transparent py-2.5 pr-4 pl-11 text-sm placeholder:text-[#9ca3af] focus:outline-none ${LOGIN_CARD_PRIMARY_TEXT_CLASSNAME}`}
                            disabled={loading}
                            autoComplete="current-password"
                          />
                        </div>
                      </div>
                    </div>

                    {error ? (
                      <div className="flex items-center gap-2 rounded-xl border-2 border-red-200 bg-red-50 p-2.5 text-red-700 animate-shake">
                        <AlertCircle className="h-4 w-4 flex-shrink-0" />
                        <span className="text-sm font-medium">{error}</span>
                      </div>
                    ) : null}

                    <div className="flex items-center justify-between text-xs">
                      <label className="group flex cursor-pointer items-center gap-2">
                        <input
                          type="checkbox"
                          className="h-4 w-4 cursor-pointer rounded border-2 border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500"
                        />
                        <span
                          className={`font-medium transition-colors group-hover:text-blue-600 ${LOGIN_CARD_LABEL_TEXT_CLASSNAME}`}
                        >
                          Lembrar-me
                        </span>
                      </label>
                      <a
                        href="#"
                        className="font-semibold text-blue-600 transition-all hover:text-blue-700 hover:underline"
                      >
                        Esqueceu a senha?
                      </a>
                    </div>

                    <button
                      type="submit"
                      disabled={loading}
                      className="group relative w-full overflow-hidden rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 py-3 text-sm font-bold text-white shadow-lg transition-all duration-300 hover:from-blue-700 hover:to-indigo-700 hover:shadow-xl focus:ring-4 focus:ring-blue-300 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <span className="absolute inset-0 h-full w-full -translate-x-full bg-gradient-to-r from-white/0 via-white/20 to-white/0 transition-transform duration-700 group-hover:translate-x-full" />

                      {loading ? (
                        <span className="flex items-center justify-center gap-2">
                          <div className="h-4 w-4 animate-spin rounded-full border-3 border-white border-t-transparent" />
                          <span>Entrando...</span>
                        </span>
                      ) : (
                        <span className="flex items-center justify-center gap-2">
                          <span>Entrar no Office</span>
                          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                        </span>
                      )}
                    </button>
                  </form>

                  <p className={`mt-4 text-center text-xs ${LOGIN_CARD_SECONDARY_TEXT_CLASSNAME}`}>
                    Nao tem conta?{" "}
                    <Link
                      href="/solicitar-acesso"
                      className="font-semibold text-blue-600 hover:text-blue-700 hover:underline"
                    >
                      Solicitar acesso
                    </Link>
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// Verificacao se esta logado
export const getServerSideProps = canSSRGuest(async (ctx) => {
  return {
    props: {},
  };
});
