import { useState } from "react";
import { Download, Instagram, Printer } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";

import { useModuleAccess } from "@modules/auth";
import { clientService } from "@modules/clients";
import type { ClientInstagramProfile } from "@modules/clients/types";
import { Dialog } from "@shared/components";
import { useFetch } from "@shared/hooks";

import { toInstagramProfileUrl } from "../utils/instagramProfile";
import {
  createInstagramReportCsv,
  downloadCsvFile,
  INSTAGRAM_REPORT_COLUMNS,
  instagramReportRows,
  instagramReportTotalsLabel,
} from "../utils/marketingCsv";
import { printMarketingReport } from "../utils/printMarketingReport";
import { marketingPrimaryButtonClass, marketingSecondaryButtonClass } from "./marketingButtonStyles";
import { MarketingReportTable } from "./MarketingReportTable";

type ProfileFilter = "with" | "without" | "all";

const FILTERS: Record<ProfileFilter, { label: string; title: string; file: string }> = {
  with: { label: "Com Instagram", title: "Clientes com Instagram", file: "clientes-com-instagram.csv" },
  without: { label: "Sem Instagram", title: "Clientes sem Instagram", file: "clientes-sem-instagram.csv" },
  all: { label: "Todos", title: "Clientes e perfis Instagram", file: "clientes-instagram.csv" },
};
const PAGE_SIZE = 100;

// ponytail: páginas de 100 em sequência; trocar por um endpoint sem paginação se a
// carteira ativa passar de alguns milhares de clientes.
async function listActiveProfiles(profile: ProfileFilter): Promise<ClientInstagramProfile[]> {
  const filters = { profile, status: "Ativo", limit: PAGE_SIZE } as const;
  let page = await clientService.listInstagramProfiles({ ...filters, page: 1 });
  const items = [...page.items];
  while (page.hasMore) {
    page = await clientService.listInstagramProfiles({ ...filters, page: page.page + 1 });
    items.push(...page.items);
  }
  return items;
}

function ReportContent({ items, profile }: { items: ClientInstagramProfile[]; profile: ProfileFilter }) {
  const rows = instagramReportRows(items).map((row, index) => {
    const profileUrl = toInstagramProfileUrl(items[index]?.instagram);
    return [
      ...row,
      profileUrl ? (
        <QRCodeSVG aria-label={`QR Code para ${profileUrl}`} level="M" size={96} value={profileUrl} />
      ) : (
        "Indisponível"
      ),
    ];
  });

  return (
    <article
      aria-label={FILTERS[profile].title}
      className="marketing-print-report space-y-6 text-gray-900 dark:text-slate-100"
      id="marketing-instagram-report"
    >
      <div className="hide-on-print flex flex-wrap justify-end gap-2">
        <button
          className={marketingSecondaryButtonClass}
          disabled={items.length === 0}
          onClick={() => downloadCsvFile(FILTERS[profile].file, createInstagramReportCsv(items))}
          type="button"
        >
          <Download aria-hidden="true" className="mr-1.5 inline h-4 w-4" />
          Exportar CSV
        </button>
        <button
          className={marketingPrimaryButtonClass}
          onClick={() => printMarketingReport("marketing-instagram-report")}
          type="button"
        >
          <Printer aria-hidden="true" className="h-4 w-4" />
          Imprimir relatório
        </button>
      </div>

      <header className="border-b border-gray-200 pb-4 dark:border-slate-700">
        <p className="text-sm text-gray-600 dark:text-slate-300">Relatório de Instagram</p>
        <h2 className="text-xl font-semibold">{FILTERS[profile].title}</h2>
        <p className="text-sm text-gray-700 dark:text-slate-200">
          {instagramReportTotalsLabel(items.length)}
        </p>
      </header>

      <MarketingReportTable
        columns={[...INSTAGRAM_REPORT_COLUMNS, "QR Code"]}
        emptyMessage="Nenhum cliente ativo para este filtro."
        ids={items.map((item) => item.id)}
        rows={rows}
        title="Clientes"
      />
    </article>
  );
}

export function MarketingInstagramReport() {
  const { access, user } = useModuleAccess("marketing");
  const [open, setOpen] = useState(false);
  const [profile, setProfile] = useState<ProfileFilter>("with");
  const query = useFetch(
    ["clients", "instagram-profiles", "report", user?.organization_id ?? "no-organization", profile],
    () => listActiveProfiles(profile),
    { enabled: open && access.canView && Boolean(user?.organization_id) },
  );

  if (!access.canView) return null;

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <div className="mb-4 flex items-center gap-2">
        <Instagram aria-hidden="true" className="h-4 w-4 text-blue-600 dark:text-blue-300" />
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Relatório de Instagram</h2>
          <p className="text-sm text-gray-500 dark:text-slate-400">
            Clientes ativos com ou sem perfil Instagram, com QR Code do perfil. Somente consulta.
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm text-gray-700 dark:text-slate-200">
          Perfil
          <select
            className="ml-2 rounded-md border border-gray-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-900"
            onChange={(event) => setProfile(event.target.value as ProfileFilter)}
            value={profile}
          >
            {(Object.keys(FILTERS) as ProfileFilter[]).map((key) => (
              <option key={key} value={key}>{FILTERS[key].label}</option>
            ))}
          </select>
        </label>
        <button className={marketingPrimaryButtonClass} onClick={() => setOpen(true)} type="button">
          Abrir relatório
        </button>
      </div>

      <Dialog
        contentClassName="w-[min(96vw,900px)]"
        description="Clientes ativos do cadastro canônico e seus perfis Instagram"
        onOpenChange={setOpen}
        open={open}
        title={FILTERS[profile].title}
      >
        {query.isLoading ? (
          <p className="text-sm text-gray-600 dark:text-slate-300" role="status">Carregando relatório…</p>
        ) : null}
        {query.isError ? (
          <div className="space-y-3" role="alert">
            <p className="text-sm text-red-700 dark:text-red-300">
              Não foi possível carregar o relatório. Verifique sua permissão ou tente novamente.
            </p>
            <button className={marketingSecondaryButtonClass} onClick={() => void query.refetch()} type="button">
              Tentar novamente
            </button>
          </div>
        ) : null}
        {query.data ? <ReportContent items={query.data} profile={profile} /> : null}
      </Dialog>
    </section>
  );
}
