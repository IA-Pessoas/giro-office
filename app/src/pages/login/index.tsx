import { useContext, useState } from "react";
import type { FormEvent } from "react";
import Head from "next/head";
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
      title: "Gestão Integrada",
      description: "Todos os departamentos em um só lugar",
    },
    {
      icon: Shield,
      title: "Segurança Total",
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
      // Em geral o fluxo já redireciona, mas garantimos um destino padrão.
      if (router.pathname === "/login") {
        await router.push("/dashboard");
      }
    } catch (err) {
      setError("Login ou senha inválidos");
      setLoading(false);
    }
  };

  return (
    <>
      <Head>
        <title>Login - Castelo Workspace</title>
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 flex items-center justify-center p-4 relative overflow-hidden">
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -top-40 -left-40 w-80 h-80 bg-blue-400 rounded-full mix-blend-overlay filter blur-3xl opacity-70 animate-blob" />
          <div className="absolute -top-40 -right-40 w-80 h-80 bg-indigo-400 rounded-full mix-blend-overlay filter blur-3xl opacity-70 animate-blob animation-delay-2000" />
          <div className="absolute -bottom-40 left-20 w-80 h-80 bg-blue-300 rounded-full mix-blend-overlay filter blur-3xl opacity-70 animate-blob animation-delay-4000" />
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAxMCAwIEwgMCAwIDAgMTAiIGZpbGw9Im5vbmUiIHN0cm9rZT0id2hpdGUiIHN0cm9rZS13aWR0aD0iMC41IiBvcGFjaXR5PSIwLjEiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9InVybCgjZ3JpZCkiLz48L3N2Zz4=')] opacity-20" />
        </div>

        <div className="w-full max-w-6xl relative z-10">
          <div className="grid lg:grid-cols-2 gap-6 items-center">
            <div className="hidden lg:flex flex-col justify-center text-white space-y-6 animate-fade-in-left">
              <div className="space-y-4">
                <div className="inline-flex items-center gap-4 bg-white rounded-2xl p-3 shadow-2xl">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center">
                      <span className="text-xs font-bold text-white">CW</span>
                    </div>
                    <span className="text-xl font-bold tracking-tight text-gray-900">Workspace</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <h1 className="text-4xl font-bold leading-tight">
                    Gerencie tudo em
                    <br />
                    <span className="text-blue-200">um só lugar</span>
                  </h1>
                  <p className="text-base text-blue-100">
                    Sistema completo de gestão empresarial modular e inteligente
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                {features.map((feature, index) => {
                  const Icon = feature.icon;
                  return (
                    <div
                      key={feature.title}
                      className="flex items-start gap-3 p-3 bg-white/10 backdrop-blur-sm rounded-xl border border-white/20 hover:bg-white/15 transition-all duration-300 animate-fade-in-left"
                      style={{ animationDelay: `${index * 150}ms` }}
                    >
                      <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center flex-shrink-0">
                        <Icon className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-sm mb-0.5">{feature.title}</h3>
                        <p className="text-blue-100 text-xs leading-relaxed">{feature.description}</p>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="text-center p-3 bg-white/10 backdrop-blur-sm rounded-xl border border-white/20">
                  <div className="text-2xl font-bold mb-0.5">6</div>
                  <div className="text-xs text-blue-100">Módulos</div>
                </div>
                <div className="text-center p-3 bg-white/10 backdrop-blur-sm rounded-xl border border-white/20">
                  <div className="text-2xl font-bold mb-0.5">99.9%</div>
                  <div className="text-xs text-blue-100">Uptime</div>
                </div>
                <div className="text-center p-3 bg-white/10 backdrop-blur-sm rounded-xl border border-white/20">
                  <div className="text-2xl font-bold mb-0.5">24/7</div>
                  <div className="text-xs text-blue-100">Suporte</div>
                </div>
              </div>
            </div>

            <div className="animate-fade-in-right flex items-center justify-center">
              <div className="lg:hidden absolute top-6 left-1/2 -translate-x-1/2">
                <div className="inline-flex items-center justify-center gap-3 bg-white rounded-2xl p-3 shadow-2xl">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center">
                      <span className="text-xs font-bold text-white">CW</span>
                    </div>
                    <span className="text-xl font-bold tracking-tight text-gray-900">Workspace</span>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-3xl shadow-2xl p-6 md:p-8 relative overflow-hidden w-full max-w-md mt-20 lg:mt-0">
                <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-blue-500 to-indigo-600 opacity-10 rounded-bl-full" />

                <div className="relative z-10">
                  <div className="mb-5">
                    <div className="flex items-center gap-2 mb-2">
                      <Sparkles className="w-5 h-5 text-blue-600" />
                      <h2 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                        Bem-vindo
                      </h2>
                    </div>
                    <p className="text-gray-600 text-sm">Entre com suas credenciais para acessar</p>
                  </div>

                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="group">
                      <label htmlFor="login" className="block text-sm font-semibold text-gray-700 mb-1.5">
                        Login
                      </label>
                      <div className="relative">
                        <div
                          className={`absolute inset-0 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-xl transition-opacity duration-300 ${
                            focusedField === "login" ? "opacity-100" : "opacity-0"
                          }`}
                          style={{ padding: "2px" }}
                        >
                          <div className="bg-white rounded-xl h-full" />
                        </div>
                        <div className="relative">
                          <Mail
                            className={`absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 transition-colors duration-300 ${
                              focusedField === "login" ? "text-blue-600" : "text-gray-400"
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
                            className="w-full pl-11 pr-4 py-2.5 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-transparent transition-all duration-300 text-gray-900 placeholder:text-gray-400 text-sm"
                            disabled={loading}
                            autoComplete="username"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="group">
                      <label htmlFor="password" className="block text-sm font-semibold text-gray-700 mb-1.5">
                        Senha
                      </label>
                      <div className="relative">
                        <div
                          className={`absolute inset-0 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-xl transition-opacity duration-300 ${
                            focusedField === "password" ? "opacity-100" : "opacity-0"
                          }`}
                          style={{ padding: "2px" }}
                        >
                          <div className="bg-white rounded-xl h-full" />
                        </div>
                        <div className="relative">
                          <Lock
                            className={`absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 transition-colors duration-300 ${
                              focusedField === "password" ? "text-blue-600" : "text-gray-400"
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
                            className="w-full pl-11 pr-4 py-2.5 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-transparent transition-all duration-300 text-gray-900 text-sm"
                            disabled={loading}
                            autoComplete="current-password"
                          />
                        </div>
                      </div>
                    </div>

                    {error ? (
                      <div className="flex items-center gap-2 p-2.5 bg-red-50 border-2 border-red-200 rounded-xl text-red-700 animate-shake">
                        <AlertCircle className="w-4 h-4 flex-shrink-0" />
                        <span className="font-medium text-sm">{error}</span>
                      </div>
                    ) : null}

                    <div className="flex items-center justify-between text-xs">
                      <label className="flex items-center gap-2 cursor-pointer group">
                        <input
                          type="checkbox"
                          className="w-4 h-4 text-blue-600 border-2 border-gray-300 rounded focus:ring-2 focus:ring-blue-500 cursor-pointer"
                        />
                        <span className="text-gray-700 font-medium group-hover:text-blue-600 transition-colors">
                          Lembrar-me
                        </span>
                      </label>
                      <a
                        href="#"
                        className="text-blue-600 hover:text-blue-700 font-semibold hover:underline transition-all"
                      >
                        Esqueceu a senha?
                      </a>
                    </div>

                    <button
                      type="submit"
                      disabled={loading}
                      className="group relative w-full py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold rounded-xl hover:from-blue-700 hover:to-indigo-700 focus:outline-none focus:ring-4 focus:ring-blue-300 transition-all duration-300 shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden text-sm"
                    >
                      <span className="absolute inset-0 w-full h-full bg-gradient-to-r from-white/0 via-white/20 to-white/0 -translate-x-full group-hover:translate-x-full transition-transform duration-700" />

                      {loading ? (
                        <span className="flex items-center justify-center gap-2">
                          <div className="w-4 h-4 border-3 border-white border-t-transparent rounded-full animate-spin" />
                          <span>Entrando...</span>
                        </span>
                      ) : (
                        <span className="flex items-center justify-center gap-2">
                          <span>Entrar no Workspace</span>
                          <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                        </span>
                      )}
                    </button>
                  </form>

                  <div className="mt-4 p-2.5 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg border border-blue-100">
                    <div className="flex items-center gap-2 mb-0.5">
                      <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                      <p className="text-xs font-bold text-blue-800 uppercase">Demo</p>
                    </div>
                    <p className="text-xs text-blue-700">Use qualquer login e senha válidos</p>
                  </div>

                  <p className="text-center text-xs text-gray-600 mt-4">
                    Não tem conta?{" "}
                    <a
                      href="#"
                      className="text-blue-600 hover:text-blue-700 font-semibold hover:underline"
                    >
                      Solicitar acesso
                    </a>
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <style jsx global>{`
          @keyframes blob {
            0%,
            100% {
              transform: translate(0, 0) scale(1);
            }
            25% {
              transform: translate(20px, -50px) scale(1.1);
            }
            50% {
              transform: translate(-20px, 20px) scale(0.9);
            }
            75% {
              transform: translate(50px, 50px) scale(1.05);
            }
          }

          @keyframes fade-in-left {
            from {
              opacity: 0;
              transform: translateX(-30px);
            }
            to {
              opacity: 1;
              transform: translateX(0);
            }
          }

          @keyframes fade-in-right {
            from {
              opacity: 0;
              transform: translateX(30px);
            }
            to {
              opacity: 1;
              transform: translateX(0);
            }
          }

          @keyframes shake {
            0%,
            100% {
              transform: translateX(0);
            }
            25% {
              transform: translateX(-5px);
            }
            75% {
              transform: translateX(5px);
            }
          }

          .animate-blob {
            animation: blob 7s infinite;
          }

          .animation-delay-2000 {
            animation-delay: 2s;
          }

          .animation-delay-4000 {
            animation-delay: 4s;
          }

          .animate-fade-in-left {
            animation: fade-in-left 0.6s ease-out forwards;
          }

          .animate-fade-in-right {
            animation: fade-in-right 0.6s ease-out forwards;
          }

          .animate-shake {
            animation: shake 0.5s ease-in-out;
          }
        `}</style>
      </div>
    </>
  );
}

// Verificação se esta logado
export const getServerSideProps = canSSRGuest(async(ctx) => {
    return {
        props: {

        }
    }
})