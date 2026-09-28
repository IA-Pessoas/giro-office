import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Instagram, Loader2, QrCode, Save, Search } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useDeferredValue, useEffect, useState } from "react";

import { useModuleAccess } from "@modules/auth";
import { CLIENTS_QUERY_KEY, clientService } from "@modules/clients";
import type { ClientInstagramProfile } from "@modules/clients/types";
import { Dialog } from "@shared/components/ui/Dialog";
import { useFetch } from "@shared/hooks";

import { toInstagramProfileUrl } from "../utils/instagramProfile";

const PAGE_SIZE = 20;
const REPORT_QUERY_PREFIX = ["clients", "instagram-profiles"] as const;

function ProfileRow({
  client,
  editable,
  saving,
  onSave,
}: {
  client: ClientInstagramProfile;
  editable: boolean;
  saving: boolean;
  onSave: (clientId: string, instagram: string | null) => void;
}) {
  const [instagram, setInstagram] = useState(client.instagram ?? "");
  const [qrOpen, setQrOpen] = useState(false);
  const profileUrl = toInstagramProfileUrl(client.instagram);

  useEffect(() => {
    setInstagram(client.instagram ?? "");
  }, [client.instagram]);

  return (
    <tr className="border-t border-gray-100 align-top dark:border-slate-700">
      <td className="px-4 py-3">
        <p className="font-medium text-gray-900 dark:text-white">{client.name}</p>
        <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">{client.status}</p>
      </td>
      <td className="px-4 py-3">
        {editable ? (
          <form
            className="flex min-w-64 gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              onSave(client.id, instagram.trim() || null);
            }}
          >
            <label className="sr-only" htmlFor={`instagram-${client.id}`}>
              Perfil Instagram de {client.name}
            </label>
            <input
              id={`instagram-${client.id}`}
              className="min-w-0 flex-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
              value={instagram}
              onChange={(event) => setInstagram(event.target.value)}
              placeholder="@usuario ou link do perfil"
              maxLength={200}
              disabled={saving}
            />
            <button
              className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700"
              type="submit"
              disabled={saving || instagram === (client.instagram ?? "")}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
              Salvar
            </button>
          </form>
        ) : (
          <span className="text-sm text-gray-700 dark:text-slate-200">
            {client.instagram?.trim() || "Sem perfil"}
          </span>
        )}
      </td>
      <td className="px-4 py-3 text-right">
        {profileUrl ? (
          <button
            type="button"
            onClick={() => setQrOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700"
            aria-label={`Gerar QR Code do Instagram de ${client.name}`}
          >
            <QrCode className="h-4 w-4" aria-hidden="true" />
            QR Code
          </button>
        ) : (
          <span className="text-xs text-gray-400 dark:text-slate-500">Indisponível</span>
        )}
        <Dialog
          open={qrOpen}
          onOpenChange={setQrOpen}
          title={`Instagram de ${client.name}`}
          description="QR Code do perfil Instagram cadastrado para este cliente."
          contentClassName="w-[min(92vw,420px)]"
          bodyClassName="flex flex-col items-center gap-4"
        >
          {profileUrl ? (
            <>
              <QRCodeSVG
                value={profileUrl}
                size={240}
                level="M"
                includeMargin
                aria-label={`QR Code para ${profileUrl}`}
              />
              <a
                className="text-sm font-medium text-blue-700 underline underline-offset-2 dark:text-blue-300"
                href={profileUrl}
                target="_blank"
                rel="noreferrer"
              >
                Abrir perfil Instagram
              </a>
            </>
          ) : null}
        </Dialog>
      </td>
    </tr>
  );
}

export function MarketingInstagramProfiles() {
  const { access, isLoading: accessLoading, user } = useModuleAccess("integracao");
  const queryClient = useQueryClient();
  const [profile, setProfile] = useState<"all" | "with" | "without">("all");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search.trim());
  const queryKey = [
    ...REPORT_QUERY_PREFIX,
    user?.organization_id ?? "no-organization",
    user?.id ?? "anonymous",
    profile,
    page,
    deferredSearch,
  ];
  const reportQuery = useFetch(
    queryKey,
    () =>
      clientService.listInstagramProfiles({
        profile,
        page,
        limit: PAGE_SIZE,
        search: deferredSearch || undefined,
      }),
    { enabled: access.canView && Boolean(user?.organization_id) },
  );
  const updateProfile = useMutation({
    mutationFn: ({ clientId, instagram }: { clientId: string; instagram: string | null }) =>
      clientService.updateIntegration(clientId, { instagram }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: REPORT_QUERY_PREFIX }),
        queryClient.invalidateQueries({ queryKey: CLIENTS_QUERY_KEY }),
      ]);
    },
  });

  if (accessLoading) {
    return <p className="text-sm text-gray-500 dark:text-slate-400" role="status">Verificando acesso ao módulo de clientes…</p>;
  }

  if (!access.canView) {
    return (
      <section className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Perfis Instagram dos clientes</h2>
        <p className="mt-2 text-sm text-gray-600 dark:text-slate-300">Seu perfil não tem permissão de leitura de clientes no Office.</p>
      </section>
    );
  }

  const report = reportQuery.data;
  const pageCount = report ? Math.max(1, Math.ceil(report.total / PAGE_SIZE)) : 1;

  return (
    <section className="space-y-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <Instagram className="mt-1 h-4 w-4 text-blue-600 dark:text-blue-300" aria-hidden="true" />
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Perfis Instagram dos clientes</h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">Consulte e mantenha o perfil no cadastro canônico do cliente. Os QR Codes são gerados localmente.</p>
          </div>
        </div>
        <label className="text-sm text-gray-700 dark:text-slate-200">
          Perfil
          <select
            className="ml-2 rounded-md border border-gray-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-900"
            value={profile}
            onChange={(event) => {
              setProfile(event.target.value as typeof profile);
              setPage(1);
            }}
          >
            <option value="all">Todos</option>
            <option value="with">Com perfil</option>
            <option value="without">Sem perfil</option>
          </select>
        </label>
      </div>

      <label className="flex max-w-lg items-center gap-2 rounded-md border border-gray-300 px-3 dark:border-slate-600">
        <Search className="h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />
        <span className="sr-only">Buscar cliente</span>
        <input
          className="min-w-0 flex-1 bg-transparent py-2 text-sm text-gray-900 outline-none placeholder:text-gray-400 dark:text-white"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
          placeholder="Buscar por nome"
          maxLength={200}
        />
      </label>

      {updateProfile.isError ? (
        <p className="flex items-center gap-2 text-sm text-red-700 dark:text-red-300" role="alert">
          <AlertCircle className="h-4 w-4" aria-hidden="true" />Não foi possível salvar o perfil. Verifique sua permissão e tente novamente.
        </p>
      ) : null}
      {reportQuery.isLoading ? (
        <p className="flex items-center gap-2 text-sm text-gray-500 dark:text-slate-400" role="status">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Carregando relatório…
        </p>
      ) : reportQuery.isError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200" role="alert">
          <p>Não foi possível carregar os perfis. Verifique sua permissão ou tente novamente.</p>
          <button className="mt-2 font-semibold underline" type="button" onClick={() => void reportQuery.refetch()}>Tentar novamente</button>
        </div>
      ) : report?.items.length ? (
        <>
          <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-slate-700">
            <table className="w-full min-w-[700px] text-left text-sm">
              <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:bg-slate-900/60 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-3">Cliente</th>
                  <th className="px-4 py-3">Perfil Instagram</th>
                  <th className="px-4 py-3 text-right">QR Code</th>
                </tr>
              </thead>
              <tbody>
                {report.items.map((client) => (
                  <ProfileRow
                    key={client.id}
                    client={client}
                    editable={access.canEdit}
                    saving={updateProfile.isPending && updateProfile.variables?.clientId === client.id}
                    onSave={(clientId, instagram) => updateProfile.mutate({ clientId, instagram })}
                  />
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-gray-500 dark:text-slate-400">
            <span>{report.total.toLocaleString("pt-BR")} cliente(s)</span>
            <div className="flex items-center gap-2">
              <button
                className="rounded-md border border-gray-300 px-3 py-1.5 font-medium text-gray-700 disabled:opacity-50 dark:border-slate-600 dark:text-slate-200"
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((current) => current - 1)}
              >Anterior</button>
              <span>Página {page} de {pageCount}</span>
              <button
                className="rounded-md border border-gray-300 px-3 py-1.5 font-medium text-gray-700 disabled:opacity-50 dark:border-slate-600 dark:text-slate-200"
                type="button"
                disabled={!report.hasMore}
                onClick={() => setPage((current) => current + 1)}
              >Próxima</button>
            </div>
          </div>
        </>
      ) : (
        <p className="rounded-lg border border-dashed border-gray-300 px-4 py-8 text-center text-sm text-gray-500 dark:border-slate-600 dark:text-slate-400" role="status">
          Nenhum cliente encontrado para este filtro.
        </p>
      )}
    </section>
  );
}
