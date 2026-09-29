import { useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff, KeyRound, Loader2, Pencil, Plus, Save, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";

import { useModuleAccess } from "@modules/auth";
import { useFetch } from "@shared/hooks";

import {
  marketingPasswordService,
  type MarketingPassword,
  type MarketingPasswordInput,
} from "../services/marketingPasswordService";
import { marketingQueryKey } from "../utils/marketingQueryKeys";

const PASSWORDS_QUERY_KEY = ["marketing", "passwords"] as const;
const RECONCILIATION_QUERY_KEY = ["marketing", "passwords", "reconciliation"] as const;

function triggerDownload(filename: string, content: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: "application/json" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function MarketingPasswords() {
  const { access, isLoading: accessLoading, user: authUser } = useModuleAccess("marketing");
  const queryClient = useQueryClient();
  const passwordsQueryKey = marketingQueryKey(PASSWORDS_QUERY_KEY, authUser);
  const reconciliationQueryKey = marketingQueryKey(RECONCILIATION_QUERY_KEY, authUser);
  const passwordsQuery = useFetch(passwordsQueryKey, marketingPasswordService.list, {
    enabled: access.canView,
  });
  const reconciliationQuery = useFetch(
    reconciliationQueryKey,
    marketingPasswordService.reconciliation,
    { enabled: access.canEdit },
  );

  const [editingId, setEditingId] = useState<string | null>(null);
  const [local, setLocal] = useState("");
  const [user, setUser] = useState("");
  const [password, setPassword] = useState("");
  const [notes, setNotes] = useState("");
  const [revealed, setRevealed] = useState<{
    id: string;
    value: string;
    userId: string | null;
    organizationId: string | null;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [exportingId, setExportingId] = useState<string | null>(null);
  const [importJson, setImportJson] = useState("[]");
  const [busyImport, setBusyImport] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    if (!access.canEdit) setRevealed(null);
  }, [access.canEdit]);

  useEffect(() => {
    setRevealed(null);
    setEditingId(null);
    setLocal("");
    setUser("");
    setPassword("");
    setNotes("");
    setImportJson("[]");
    setError("");
    setStatus("");
  }, [authUser?.id, authUser?.organization_id]);

  const currentReveal =
    revealed?.userId === (authUser?.id ?? null) &&
    revealed?.organizationId === (authUser?.organization_id ?? null)
      ? revealed
      : null;

  const resetForm = () => {
    setEditingId(null);
    setLocal("");
    setUser("");
    setPassword("");
    setNotes("");
  };

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: passwordsQueryKey }),
      queryClient.invalidateQueries({ queryKey: reconciliationQueryKey }),
    ]);
  };

  const beginEdit = (credential: MarketingPassword) => {
    setEditingId(credential.id);
    setLocal(credential.local);
    setUser(credential.user);
    setPassword("");
    setNotes(credential.notes ?? "");
    setError("");
    setStatus("");
  };

  const saveCredential = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setStatus("");

    const values: MarketingPasswordInput = {
      local: local.trim(),
      user: user.trim(),
      password,
      notes: notes.trim() || null,
    };

    try {
      if (editingId) {
        const { password: _unused, ...metadata } = values;
        await marketingPasswordService.update(editingId, {
          ...metadata,
          ...(password ? { password } : {}),
        });
        setStatus("Credencial atualizada.");
      } else {
        await marketingPasswordService.create(values);
        setStatus("Credencial cadastrada com criptografia do Office.");
      }
      resetForm();
      await refresh();
    } catch {
      setError("Não foi possível salvar. Verifique se já existe esse local e usuário.");
    } finally {
      setSaving(false);
    }
  };

  const revealCredential = async (credential: MarketingPassword) => {
    if (
      !window.confirm(
        `Revelar a senha de ${credential.local} para ${credential.user}? A senha será exibida nesta tela.`,
      )
    ) {
      return;
    }
    setRevealed(null);
    setError("");
    try {
      const result = await marketingPasswordService.reveal(credential.id);
      setRevealed({
        id: credential.id,
        value: result.password,
        userId: authUser?.id ?? null,
        organizationId: authUser?.organization_id ?? null,
      });
    } catch {
      setError("Não foi possível revelar esta credencial.");
    }
  };

  const exportCredential = async (credential: MarketingPassword) => {
    if (
      !window.confirm(
        `Exportar a senha de ${credential.local} para ${credential.user} em um arquivo sem criptografia?`,
      )
    ) {
      return;
    }
    setExportingId(credential.id);
    setError("");
    try {
      const result = await marketingPasswordService.export(credential.id);
      triggerDownload(
        `credencial-marketing-${credential.id}.json`,
        JSON.stringify(result, null, 2),
      );
    } catch {
      setError("Não foi possível exportar esta credencial.");
    } finally {
      setExportingId(null);
    }
  };

  const importCredentials = async () => {
    setBusyImport(true);
    setError("");
    setStatus("");
    try {
      const records: unknown = JSON.parse(importJson);
      if (
        !Array.isArray(records) ||
        records.length === 0 ||
        records.length > 1_000 ||
        records.some((record) => !record || typeof record !== "object" || Array.isArray(record))
      ) {
        throw new Error("invalid_records");
      }
      const result = await marketingPasswordService.importLegacy(
        records as Array<Record<string, unknown>>,
      );
      setStatus(`Importadas: ${result.imported}; em quarentena: ${result.quarantined}.`);
      await refresh();
    } catch {
      setError("Não foi possível importar. Confira o JSON, o formato Office e os vínculos.");
    } finally {
      setBusyImport(false);
    }
  };

  if (accessLoading) {
    return (
      <p className="text-sm text-gray-500 dark:text-slate-400" role="status">
        Verificando acesso às credenciais de Marketing…
      </p>
    );
  }

  if (!access.canView) {
    return (
      <section className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
          Senhas de Marketing
        </h2>
        <p className="mt-2 text-sm text-gray-600 dark:text-slate-300">
          Seu perfil não tem permissão para consultar credenciais de Marketing.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-5 rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <div className="flex items-start gap-2">
        <KeyRound className="mt-1 h-4 w-4 text-blue-600 dark:text-blue-300" aria-hidden="true" />
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Senhas de Marketing
          </h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">
            Os segredos ficam mascarados e criptografados. Revelar e exportar exigem confirmação.
          </p>
        </div>
      </div>

      {error ? <p className="text-sm text-red-700 dark:text-red-300" role="alert">{error}</p> : null}
      {status ? <p className="text-sm text-green-700 dark:text-green-300" role="status">{status}</p> : null}
      {passwordsQuery.isError ? (
        <p className="text-sm text-red-700 dark:text-red-300" role="alert">
          Não foi possível carregar as credenciais.
        </p>
      ) : null}

      {access.canEdit ? (
        <form className="grid gap-3 rounded-lg border border-gray-200 p-4 dark:border-slate-700 md:grid-cols-2" onSubmit={saveCredential}>
          <h3 className="md:col-span-2 font-semibold text-gray-900 dark:text-white">
            {editingId ? "Editar credencial" : "Cadastrar credencial"}
          </h3>
          <label className="text-sm text-gray-700 dark:text-slate-200">
            Local
            <input required maxLength={200} value={local} onChange={(event) => setLocal(event.target.value)} className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-900" />
          </label>
          <label className="text-sm text-gray-700 dark:text-slate-200">
            Usuário
            <input required maxLength={200} value={user} onChange={(event) => setUser(event.target.value)} className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-900" />
          </label>
          <label className="text-sm text-gray-700 dark:text-slate-200 md:col-span-2">
            Senha {editingId ? "(deixe em branco para manter a atual)" : ""}
            <input required={!editingId} type="password" autoComplete="new-password" maxLength={4_000} value={password} onChange={(event) => setPassword(event.target.value)} className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-900" />
          </label>
          <label className="text-sm text-gray-700 dark:text-slate-200 md:col-span-2">
            Observações
            <textarea maxLength={5_000} rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-900" />
          </label>
          <div className="flex gap-2 md:col-span-2">
            <button className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60" disabled={saving} type="submit">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : editingId ? <Save className="h-4 w-4" aria-hidden="true" /> : <Plus className="h-4 w-4" aria-hidden="true" />}
              {saving ? "Salvando…" : editingId ? "Salvar" : "Cadastrar"}
            </button>
            {editingId ? <button className="rounded-md border border-gray-300 px-4 py-2 text-sm dark:border-slate-600 dark:text-slate-200" onClick={resetForm} type="button">Cancelar</button> : null}
          </div>
        </form>
      ) : (
        <p className="flex items-center gap-2 text-sm text-gray-600 dark:text-slate-300">
          <ShieldCheck className="h-4 w-4" aria-hidden="true" />
          Seu perfil pode consultar metadados; somente administradores podem alterar ou revelar segredos.
        </p>
      )}

      {passwordsQuery.isLoading ? <p className="text-sm text-gray-500 dark:text-slate-400">Carregando credenciais…</p> : null}
      <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-slate-700">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500 dark:bg-slate-900 dark:text-slate-400">
            <tr><th className="px-4 py-3">Local</th><th className="px-4 py-3">Usuário</th><th className="px-4 py-3">Observações</th><th className="px-4 py-3">Senha</th><th className="px-4 py-3 text-right">Ações</th></tr>
          </thead>
          <tbody>
            {(passwordsQuery.data ?? []).map((credential) => (
              <tr className="border-t border-gray-100 dark:border-slate-700" key={credential.id}>
                <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{credential.local}</td>
                <td className="px-4 py-3 text-gray-700 dark:text-slate-200">{credential.user}</td>
                <td className="px-4 py-3 text-gray-600 dark:text-slate-300">{credential.notes || "—"}</td>
                <td className="px-4 py-3 font-mono text-gray-600 dark:text-slate-300">
                  {access.canEdit && currentReveal?.id === credential.id
                    ? currentReveal.value
                    : "••••••••"}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-2">
                    {access.canEdit ? (
                      <>
                        <button className="rounded-md border border-gray-300 p-2 text-gray-700 dark:border-slate-600 dark:text-slate-200" onClick={() => beginEdit(credential)} type="button" aria-label={`Editar ${credential.local} de ${credential.user}`}>
                          <Pencil className="h-4 w-4" aria-hidden="true" />
                        </button>
                        <button
                          className="rounded-md border border-gray-300 p-2 text-gray-700 dark:border-slate-600 dark:text-slate-200"
                          onClick={() =>
                            currentReveal?.id === credential.id
                              ? setRevealed(null)
                              : void revealCredential(credential)
                          }
                          type="button"
                          aria-label={
                            currentReveal?.id === credential.id
                              ? "Ocultar senha"
                              : `Revelar senha de ${credential.local}`
                          }
                        >
                          {currentReveal?.id === credential.id ? (
                            <EyeOff className="h-4 w-4" aria-hidden="true" />
                          ) : (
                            <Eye className="h-4 w-4" aria-hidden="true" />
                          )}
                        </button>
                        <button className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 disabled:opacity-60 dark:border-slate-600 dark:text-slate-200" disabled={exportingId === credential.id} onClick={() => void exportCredential(credential)} type="button">
                          {exportingId === credential.id ? "Exportando…" : "Exportar"}
                        </button>
                      </>
                    ) : <span className="text-xs text-gray-400 dark:text-slate-500">Restrito</span>}
                  </div>
                </td>
              </tr>
            ))}
            {!passwordsQuery.isLoading && passwordsQuery.data?.length === 0 ? (
              <tr><td className="px-4 py-5 text-center text-gray-500 dark:text-slate-400" colSpan={5}>Nenhuma credencial cadastrada.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {access.canEdit ? (
        <div className="space-y-3 border-t border-gray-100 pt-4 dark:border-slate-700">
          <h3 className="font-semibold text-gray-900 dark:text-white">Importar credenciais legadas</h3>
          <p className="text-xs text-gray-500 dark:text-slate-400">
            Cole um array JSON de registros criptografados pelo Office, incluindo organization_id, local, user, password e notes. Itens sem vínculo ou validação segura vão para quarentena.
          </p>
          <textarea aria-label="Registros legados criptografados em JSON" className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 font-mono text-xs dark:border-slate-600 dark:bg-slate-900" rows={4} value={importJson} onChange={(event) => setImportJson(event.target.value)} />
          <button className="rounded-md border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 disabled:opacity-60 dark:border-slate-600 dark:text-slate-200" disabled={busyImport} onClick={() => void importCredentials()} type="button">
            {busyImport ? "Importando…" : "Importar e validar"}
          </button>
          <h4 className="pt-2 text-sm font-semibold text-gray-900 dark:text-white">
            Quarentena ({reconciliationQuery.data?.length ?? 0})
          </h4>
          {reconciliationQuery.isError ? <p className="text-sm text-red-700 dark:text-red-300">Não foi possível carregar a quarentena.</p> : null}
          <ul className="space-y-1 text-sm text-gray-600 dark:text-slate-300">
            {(reconciliationQuery.data ?? []).map((item) => (
              <li key={item.id}>{item.reason} · {item.status} · {new Date(item.created_at).toLocaleDateString()}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
