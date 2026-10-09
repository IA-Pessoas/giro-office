import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { TAX_REGIME_OPTIONS } from "@workspace/shared/regularize";
import { Calculator } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Input } from "@shared/ui/newLayout/input";
import { useContabilControlPortfolio } from "../hooks";
import { contabilContingencyService } from "../services/contabilContingencyService";
import { getContabilErrorMessage } from "../services/contabilError";
import type { ContabilControlPortfolioItem } from "../types";
import { CONTABIL_SELECT_CLASS } from "./ContabilCompetenceSelect";
import { getCurrentContabilCompetence } from "./contabilControlSection.helpers";
import { ContabilContingencyResult } from "./ContabilContingencyResult";
import { ContabilStateBox } from "./ContabilStateBox";
import { CONTABIL_OUTLINE_ACTION_CLASS } from "./contabilUiClasses";

export function ContabilContingencySection({
  clientId,
  canEdit,
}: {
  clientId: string;
  canEdit: boolean;
}) {
  const { user } = useAuth();
  const [competence] = useState(getCurrentContabilCompetence);
  const portfolio = useContabilControlPortfolio(competence);
  const company = portfolio.data?.items.find((item) => item.client_id === clientId);
  if (!company)
    return (
      <ContabilStateBox
        icon={Calculator}
        title={portfolio.isLoading ? "Carregando empresa..." : "Empresa indisponível"}
      >
        {portfolio.isLoading
          ? "Aguarde os dados da carteira contábil."
          : portfolio.error
            ? getContabilErrorMessage(portfolio.error)
            : "O cliente não está disponível na carteira contábil desta organização."}
      </ContabilStateBox>
    );
  return (
    <ContingencyForm
      key={`${user?.organization_id}:${clientId}:${company.cpf_cnpj}:${company.legal_name}`}
      company={company}
      canEdit={canEdit}
    />
  );
}

function ContingencyForm({
  company,
  canEdit,
}: {
  company: ContabilControlPortfolioItem;
  canEdit: boolean;
}) {
  const [periodStart, setPeriodStart] = useState<string>(getCurrentContabilCompetence);
  const [periodEnd, setPeriodEnd] = useState<string>(getCurrentContabilCompetence);
  const [regime, setRegime] = useState(
    company.regime && TAX_REGIME_OPTIONS.some((item) => item === company.regime)
      ? company.regime
      : "Simples Nacional",
  );
  const [annex, setAnnex] = useState("III");
  const [rate, setRate] = useState("11");
  const [file, setFile] = useState<File | null>(null);
  const simulation = useMutation({ mutationFn: contabilContingencyService.simulate });
  const fileError =
    file && (!/\.xls$/i.test(file.name) || !file.size || file.size > 5 * 1024 * 1024)
      ? "Selecione um XLS de até 5 MiB, não vazio."
      : null;
  const error = fileError ?? (simulation.error ? getContabilErrorMessage(simulation.error) : null);

  return (
    <section
      className="space-y-5 text-gray-900 dark:text-slate-100"
      aria-label="Simulação de Contingência"
      aria-busy={simulation.isPending}
    >
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">Simulação de Contingência</h2>
        <p className="text-sm text-gray-600 dark:text-slate-400">
          Envie o balancete XLS e confira a extração e os cálculos do modelo legado.
        </p>
        <p className="text-xs text-gray-500 dark:text-slate-400">
          O arquivo é temporário. Até 5 MiB, 10.000 linhas e 256 colunas; somente a primeira
          planilha é analisada.
        </p>
        {!canEdit && (
          <p className="text-sm">É necessária permissão de edição no Contábil para simular.</p>
        )}
      </div>
      <form
        className="space-y-4"
        onChange={() => simulation.reset()}
        onSubmit={(event) => {
          event.preventDefault();
          if (!file || !canEdit || fileError || simulation.isPending) return;
          simulation.mutate({
            file,
            parameters: {
              client_id: company.client_id,
              company_name: company.legal_name,
              cnpj: company.cpf_cnpj,
              period_start: periodStart,
              period_end: periodEnd,
              regime,
              annex: regime === "Simples Nacional" ? annex : "",
              rate: Number(rate),
            },
          });
        }}
      >
        <fieldset
          disabled={!canEdit || simulation.isPending}
          className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3"
        >
          <legend className="sr-only">Parâmetros da simulação</legend>
          <label className="space-y-1">
            Empresa
            <Input value={company.legal_name} readOnly />
          </label>
          <label className="space-y-1">
            CNPJ
            <Input value={company.cpf_cnpj} readOnly />
          </label>
          <label className="space-y-1">
            Alíquota de tributo (%)
            <Input
              type="number"
              min="0"
              max="100"
              step="0.01"
              required
              value={rate}
              onChange={(event) => setRate(event.target.value)}
            />
          </label>
          <label className="space-y-1">
            Período inicial
            <Input
              type="month"
              required
              value={periodStart}
              max={periodEnd}
              onChange={(event) => setPeriodStart(event.target.value)}
            />
          </label>
          <label className="space-y-1">
            Período final
            <Input
              type="month"
              required
              value={periodEnd}
              min={periodStart}
              onChange={(event) => setPeriodEnd(event.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1">
            Regime
            <select
              className={CONTABIL_SELECT_CLASS}
              value={regime}
              onChange={(event) => setRegime(event.target.value)}
            >
              {TAX_REGIME_OPTIONS.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            Anexo
            <select
              className={CONTABIL_SELECT_CLASS}
              disabled={regime !== "Simples Nacional"}
              value={regime === "Simples Nacional" ? annex : ""}
              onChange={(event) => setAnnex(event.target.value)}
            >
              <option value="">Não se aplica</option>
              {["I", "II", "III", "IV", "V"].map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 sm:col-span-2">
            Arquivo XLS
            <Input
              type="file"
              required
              accept=".xls,application/vnd.ms-excel"
              aria-invalid={Boolean(fileError)}
              aria-describedby={error ? "contingency-error" : undefined}
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
          </label>
        </fieldset>
        <button
          type="submit"
          className={CONTABIL_OUTLINE_ACTION_CLASS}
          disabled={!canEdit || !file || Boolean(fileError) || simulation.isPending}
        >
          <Calculator className="h-4 w-4" aria-hidden="true" />
          {simulation.isPending ? "Calculando..." : "Simular contingência"}
        </button>
      </form>
      {error && (
        <p id="contingency-error" role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
      {simulation.data && <ContabilContingencyResult result={simulation.data} />}
    </section>
  );
}
