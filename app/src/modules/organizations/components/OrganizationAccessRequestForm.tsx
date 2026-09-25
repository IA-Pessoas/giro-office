import { useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { AxiosError } from "axios";
import { AlertCircle, ArrowLeft, Building2, Hash, Mail, Send } from "lucide-react";
import { toast } from "@shared/services/toast";

import { formatCnpjInput, normalizeDigits } from "@shared/utils/inputFormatting";

import { organizationService } from "../services/organizationService";

function getErrorMessage(err: unknown): string {
  if (err instanceof AxiosError) {
    const data = err.response?.data as { error?: string; message?: string } | undefined;
    return data?.error ?? data?.message ?? err.message ?? "Não foi possível concluir o pedido.";
  }
  return "Não foi possível concluir o pedido.";
}

export function OrganizationAccessRequestForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [loading, setLoading] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [needsAuth, setNeedsAuth] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setNeedsAuth(false);

    const cnpjClean = normalizeDigits(cnpj);
    if (!name.trim() || !email.trim() || cnpjClean.length !== 14) {
      toast.warn("Preencha nome, e-mail válido e CNPJ com 14 dígitos.");
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      toast.error("E-mail inválido.");
      return;
    }

    setLoading(true);
    try {
      await organizationService.create({
        name: name.trim(),
        email_created_by: email.trim(),
        cnpj: cnpjClean,
      });
      toast.success("Organização registada com sucesso.");
      setName("");
      setEmail("");
      setCnpj("");
    } catch (err: unknown) {
      const status = err instanceof AxiosError ? err.response?.status : undefined;
      if (status === 401) {
        setNeedsAuth(true);
        toast.error("É necessário iniciar sessão para registar uma organização.");
      } else {
        toast.error(getErrorMessage(err));
      }
    } finally {
      setLoading(false);
    }
  };

  const inputWrap = (fieldId: string, children: ReactNode) => (
    <div className="relative">
      <div
        className={`absolute inset-0 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-xl transition-opacity duration-300 ${
          focusedField === fieldId ? "opacity-100" : "opacity-0"
        }`}
        style={{ padding: "2px" }}
      >
        <div className="bg-white rounded-xl h-full" />
      </div>
      <div className="relative">{children}</div>
    </div>
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {needsAuth ? (
        <div className="flex flex-col gap-2 p-3 bg-amber-50 border-2 border-amber-200 rounded-xl text-amber-900 text-sm">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>
              O registo de organização requer uma sessão iniciada. Entre na sua conta e volte a enviar o
              formulário.
            </span>
          </div>
          <Link
            href="/login"
            className="font-semibold text-blue-600 hover:text-blue-700 underline w-fit"
          >
            Ir para o login
          </Link>
        </div>
      ) : null}

      <div className="group">
        <label htmlFor="org-name" className="block text-sm font-semibold text-gray-700 mb-1.5">
          Nome da organização
        </label>
        {inputWrap(
          "name",
          <>
            <Building2
              className={`absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 transition-colors duration-300 ${
                focusedField === "name" ? "text-blue-600" : "text-gray-400"
              }`}
            />
            <input
              id="org-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onFocus={() => setFocusedField("name")}
              onBlur={() => setFocusedField(null)}
              placeholder="Ex.: Minha Empresa Ltda."
              className="w-full pl-11 pr-4 py-2.5 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-transparent transition-all duration-300 text-gray-900 placeholder:text-gray-400 text-sm"
              disabled={loading}
              autoComplete="organization"
            />
          </>,
        )}
      </div>

      <div className="group">
        <label htmlFor="org-email" className="block text-sm font-semibold text-gray-700 mb-1.5">
          E-mail do responsável
        </label>
        {inputWrap(
          "email",
          <>
            <Mail
              className={`absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 transition-colors duration-300 ${
                focusedField === "email" ? "text-blue-600" : "text-gray-400"
              }`}
            />
            <input
              id="org-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onFocus={() => setFocusedField("email")}
              onBlur={() => setFocusedField(null)}
              placeholder="nome@empresa.com"
              className="w-full pl-11 pr-4 py-2.5 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-transparent transition-all duration-300 text-gray-900 placeholder:text-gray-400 text-sm"
              disabled={loading}
              autoComplete="email"
            />
          </>,
        )}
      </div>

      <div className="group">
        <label htmlFor="org-cnpj" className="block text-sm font-semibold text-gray-700 mb-1.5">
          CNPJ
        </label>
        {inputWrap(
          "cnpj",
          <>
            <Hash
              className={`absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 transition-colors duration-300 ${
                focusedField === "cnpj" ? "text-blue-600" : "text-gray-400"
              }`}
            />
            <input
              id="org-cnpj"
              type="text"
              value={cnpj}
              onChange={(e) => setCnpj(formatCnpjInput(e.target.value))}
              onFocus={() => setFocusedField("cnpj")}
              onBlur={() => setFocusedField(null)}
              placeholder="Informe seu CNPJ"
              className="w-full pl-11 pr-4 py-2.5 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-transparent transition-all duration-300 text-gray-900 placeholder:text-gray-400 text-sm"
              disabled={loading}
              autoComplete="off"
            />
          </>,
        )}
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
            <span>A enviar...</span>
          </span>
        ) : (
          <span className="flex items-center justify-center gap-2">
            <span>Enviar pedido</span>
            <Send className="w-4 h-4" />
          </span>
        )}
      </button>

      <p className="text-center text-xs text-gray-600 pt-1">
        <Link
          href="/login"
          className="inline-flex items-center justify-center gap-1 font-semibold text-blue-600 hover:text-blue-700 hover:underline"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Voltar ao login
        </Link>
      </p>
    </form>
  );
}
