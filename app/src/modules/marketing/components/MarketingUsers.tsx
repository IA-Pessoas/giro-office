import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ImagePlus, Loader2 } from "lucide-react";
import { useState } from "react";

import { useModuleAccess } from "@modules/auth";
import { userService } from "@modules/users";
import type { UserDirectoryProfilesPage } from "@modules/users";
import { useFetch } from "@shared/hooks";

import { marketingQueryKey } from "../utils/marketingQueryKeys";

const PAGE_SIZE = 30;
const USERS_QUERY_ROOT = ["marketing", "users"] as const;

export function MarketingUsers() {
  const { access, isLoading: accessLoading, user } = useModuleAccess("marketing");
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const organizationId = user?.organization_id ?? null;
  const queryKey = [...marketingQueryKey(USERS_QUERY_ROOT, user), page];
  const usersQuery = useFetch(
    queryKey,
    () => userService.listProfiles({ skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    { enabled: access.canView && Boolean(organizationId) },
  );
  const photoMutation = useMutation({
    mutationFn: ({ id, file }: { id: string; file: File }) => userService.uploadPhoto(id, file),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: USERS_QUERY_ROOT });
    },
  });

  if (accessLoading) {
    return <p className="text-sm text-gray-500 dark:text-slate-400" role="status">Verificando acesso aos usuários…</p>;
  }

  if (!access.canView) return null;

  const result = usersQuery.data as UserDirectoryProfilesPage | undefined;
  const pageCount = result ? Math.max(1, Math.ceil(result.total / PAGE_SIZE)) : 1;

  return (
    <section className="space-y-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Usuários da organização</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">Consulte o diretório e mantenha as fotos dos usuários.</p>
        </div>
        {result ? <span className="text-sm text-gray-500 dark:text-slate-400">{result.total} usuários</span> : null}
      </div>

      {usersQuery.isLoading ? (
        <p className="text-sm text-gray-500 dark:text-slate-400" role="status">Carregando usuários…</p>
      ) : usersQuery.isError ? (
        <p className="text-sm text-red-600 dark:text-red-300" role="alert">Não foi possível carregar os usuários.</p>
      ) : result?.users.length ? (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {result.users.map((profile) => (
            <li key={profile.id} className="flex min-w-0 items-center gap-3 rounded-lg border border-gray-100 p-3 dark:border-slate-700">
              {profile.photo_url ? (
                <img src={profile.photo_url} alt={`Foto de ${profile.name}`} className="h-12 w-12 shrink-0 rounded-full object-cover" />
              ) : (
                <span aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-slate-500 dark:bg-slate-700 dark:text-slate-300">
                  {profile.name.slice(0, 1).toUpperCase()}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-900 dark:text-white">{profile.name}</p>
                <p className="truncate text-xs text-gray-500 dark:text-slate-400">{profile.department?.name || "Sem departamento"}</p>
                <p className="text-xs text-gray-500 dark:text-slate-400">{profile.status}</p>
              </div>
              {access.canEdit ? (
                <label className="inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700" aria-label={`Alterar foto de ${profile.name}`}>
                  {photoMutation.isPending && photoMutation.variables?.id === profile.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <ImagePlus className="h-4 w-4" aria-hidden="true" />
                  )}
                  <input
                    className="sr-only"
                    type="file"
                    accept="image/*"
                    disabled={photoMutation.isPending}
                    onChange={(event) => {
                      const file = event.currentTarget.files?.[0];
                      event.currentTarget.value = "";
                      if (file) photoMutation.mutate({ id: profile.id, file });
                    }}
                  />
                </label>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-gray-500 dark:text-slate-400">Nenhum usuário encontrado.</p>
      )}

      {pageCount > 1 ? (
        <div className="flex items-center justify-between border-t border-gray-100 pt-3 dark:border-slate-700">
          <button type="button" className="rounded-md border border-gray-300 px-3 py-2 text-sm disabled:opacity-50 dark:border-slate-600" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>Anterior</button>
          <span className="text-sm text-gray-500 dark:text-slate-400">Página {page} de {pageCount}</span>
          <button type="button" className="rounded-md border border-gray-300 px-3 py-2 text-sm disabled:opacity-50 dark:border-slate-600" disabled={page >= pageCount} onClick={() => setPage((current) => current + 1)}>Próxima</button>
        </div>
      ) : null}
    </section>
  );
}
