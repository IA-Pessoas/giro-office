import { useAssignableUsers } from "@modules/rh";
import { useFetch } from "@shared/hooks";
import { AlertCircle, Loader2, Users } from "lucide-react";
import { useState } from "react";

import { fiscalResponsibleReportQueryKey } from "../hooks/queryKeys";
import { type FiscalResponsibleReportBasis, fiscalControlService } from "../services/fiscalControlService";
import { getFiscalErrorMessage } from "../utils";
import { downloadFile } from "../utils/downloadFile";
import { competenceFromToday } from "../utils/fiscalRevenue";
import { FISCAL_FIELD_CONTROL_CLASSNAME, FISCAL_PRIMARY_BUTTON_CLASSNAME } from "./fiscalFieldStyles";
import { FiscalStateBox } from "./FiscalStateBox";

export function FiscalResponsibleReportSection() {
  const [basis, setBasis] = useState<FiscalResponsibleReportBasis>("current");
  const [competence, setCompetence] = useState(() => competenceFromToday(-1));
  const [responsibleId, setResponsibleId] = useState("");
  const users = useAssignableUsers({ module: "fiscal" });
  const byCompetence = basis === "competence";
  const report = useFetch(
    fiscalResponsibleReportQueryKey(basis, byCompetence ? competence : "", responsibleId),
    () =>
      fiscalControlService.responsibleReport({
        basis,
        competence: byCompetence ? competence : undefined,
        responsible_id: responsibleId || undefined,
      }),
    { enabled: !byCompetence || Boolean(competence) },
  );
  const data = report.data;

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Responsáveis × Empresas</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Carteira atual usa o responsável padrão de hoje. Por competência usa o responsável registrado no controle daquele mês, mesmo que a carteira tenha mudado depois. O CSV traz exatamente as linhas da tela.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <label className="grid gap-1 text-sm font-medium text-gray-700 dark:text-gray-300">
          Visão
          <select value={basis} onChange={(event) => setBasis(event.target.value as FiscalResponsibleReportBasis)} className={FISCAL_FIELD_CONTROL_CLASSNAME}>
            <option value="current">Carteira atual</option>
            <option value="competence">Por competência</option>
          </select>
        </label>
        {byCompetence ? (
          <label className="grid gap-1 text-sm font-medium text-gray-700 dark:text-gray-300">
            Competência
            <input type="month" required value={competence} onChange={(event) => setCompetence(event.target.value)} className={FISCAL_FIELD_CONTROL_CLASSNAME} />
          </label>
        ) : null}
        <label className="grid gap-1 text-sm font-medium text-gray-700 dark:text-gray-300">
          Responsável
          <select value={responsibleId} onChange={(event) => setResponsibleId(event.target.value)} className={FISCAL_FIELD_CONTROL_CLASSNAME}>
            <option value="">Todos</option>
            <option value="none">Sem responsável</option>
            {users.data?.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={!data?.items.length}
          onClick={() => data && downloadFile(new Blob([data.csv], { type: "text/csv;charset=utf-8" }), data.file_name)}
          className={FISCAL_PRIMARY_BUTTON_CLASSNAME}
        >
          Exportar CSV
        </button>
      </div>

      {report.isLoading ? (
        <div role="status">
          <FiscalStateBox icon={Loader2} tone="loading" title="Carregando relatório" compact>
            Estamos montando a carteira por responsável.
          </FiscalStateBox>
        </div>
      ) : report.error ? (
        <div role="alert">
          <FiscalStateBox icon={AlertCircle} tone="danger" title="Não foi possível carregar o relatório" compact>
            {getFiscalErrorMessage(report.error)}
          </FiscalStateBox>
        </div>
      ) : data && !data.items.length ? (
        <FiscalStateBox icon={Users} title="Nenhuma empresa encontrada" compact>
          {byCompetence ? "Não há controles nesta competência para o filtro escolhido." : "Nenhum cliente com Fiscal ativo para o filtro escolhido."}
        </FiscalStateBox>
      ) : data ? (
        <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-slate-700">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left text-gray-600 dark:bg-slate-800 dark:text-gray-300">
              <tr>
                <th scope="col" className="px-4 py-2 font-medium">Responsável</th>
                <th scope="col" className="px-4 py-2 font-medium">Empresa</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
              {data.items.map((item) => (
                <tr key={item.client_id}>
                  <td className="px-4 py-2 text-gray-800 dark:text-gray-200">
                    {item.responsible_id ? (item.responsible_name ?? "Usuário sem acesso atual") : "Sem responsável"}
                  </td>
                  <td className="px-4 py-2 text-gray-800 dark:text-gray-200">{item.client_name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
