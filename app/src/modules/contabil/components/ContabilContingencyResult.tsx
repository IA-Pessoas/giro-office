import type { ContingencySimulation } from "../services/contabilContingencyService";

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const money = (cents: number) => currency.format(cents / 100);
const hypotheses: Record<string, string> = {
  declaredRevenue: "Faturamento informado no balancete.",
  bankReceipts: "Total de recebimentos bancários usado na comparação.",
  clientReceipts: "Receita operacional considerada na base mínima.",
  relatedCompanies: "Possível receita financeira sem contrato; incluída na base máxima.",
  partnerTransfers: "Possível aporte sem contrato; incluído na base máxima.",
  cashDeposits: "Possível recebimento sem origem identificada; incluído na base máxima.",
  creditOperations: "Origem financeira regular; excluída da base de receita.",
};

export function ContabilContingencyResult({ result }: { result: ContingencySimulation }) {
  return (
    <section className="space-y-5" aria-label="Resultado da simulação">
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
        <h3 className="font-semibold">Hipóteses da simulação legada</h3>
        <p>
          As classificações abaixo precisam de conferência e documentação. Os valores não comprovam
          irregularidade fiscal.
        </p>
        <p>
          {result.identity === "matched"
            ? "O CNPJ identificado no XLS corresponde ao cliente."
            : "O XLS não contém identificação de CNPJ. Confira se o arquivo pertence à empresa selecionada."}
        </p>
      </div>
      <div role="status" className="text-sm text-gray-700 dark:text-slate-300">
        <strong>{result.parameters.company_name}</strong> · {result.parameters.cnpj}
        <br />
        {result.parameters.period_start} a {result.parameters.period_end} ·{" "}
        {result.parameters.regime}
        {result.parameters.annex && ` · Anexo ${result.parameters.annex}`} · Alíquota{" "}
        {result.parameters.rate}%
      </div>
      <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-slate-700">
        <table className="w-full text-left text-sm">
          <caption className="px-3 py-2 text-left font-semibold text-gray-900 dark:text-white">
            Extração do XLS para conferência
          </caption>
          <thead className="bg-gray-50 dark:bg-slate-800">
            <tr>
              <th scope="col" className="p-3">
                Item e origem
              </th>
              <th scope="col" className="p-3 text-right">
                Valor extraído
              </th>
              <th scope="col" className="p-3">
                Hipótese
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-slate-700">
            {result.extraction.map((item) => (
              <tr key={item.key}>
                <th scope="row" className="min-w-52 p-3 font-normal">
                  <strong>{item.label}</strong>
                  <div className="text-xs text-gray-500 dark:text-slate-400">
                    {item.sheet}!{item.valueCell} · rótulo em {item.labelCell}: {item.sourceLabel}
                  </div>
                </th>
                <td className="whitespace-nowrap p-3 text-right">
                  {money(item.valueCents)}
                  <div className="text-xs text-gray-500 dark:text-slate-400">
                    Original: {String(item.rawValue)}
                  </div>
                </td>
                <td className="min-w-52 p-3 text-gray-600 dark:text-slate-300">
                  {hypotheses[item.key]}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div className="rounded-lg border border-gray-200 p-3 dark:border-slate-700">
          <dt>Diferença identificada</dt>
          <dd className="text-lg font-semibold">{money(result.differenceCents)}</dd>
          <dd className="text-xs text-gray-500">
            Recebimentos bancários menos faturamento declarado.
          </dd>
        </div>
        <div className="rounded-lg border border-gray-200 p-3 dark:border-slate-700">
          <dt>Transferências internas entre contas PJ</dt>
          <dd className="text-lg font-semibold">{money(result.internalTransfersCents)}</dd>
          <dd className="text-xs text-gray-500">
            Hipótese: saldo dos recebimentos bancários após as cinco origens extraídas.
          </dd>
        </div>
      </dl>
      <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-slate-700">
        <table className="w-full whitespace-nowrap text-right text-sm">
          <caption className="px-3 py-2 text-left font-semibold text-gray-900 dark:text-white">
            Cenários estimados
          </caption>
          <thead className="bg-gray-50 dark:bg-slate-800">
            <tr>
              {["Cenário", "Base", "Tributo", "Multa (75%)", "Juros (6%)", "Total"].map((label) => (
                <th key={label} scope="col" className="p-3">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(
              [
                ["Mínimo", result.minimum],
                ["Máximo", result.maximum],
              ] as const
            ).map(([label, scenario]) => (
              <tr key={label}>
                <th scope="row" className="p-3">
                  {label}
                </th>
                {[
                  scenario.baseCents,
                  scenario.taxCents,
                  scenario.penaltyCents,
                  scenario.interestCents,
                  scenario.totalCents,
                ].map((value, index) => (
                  <td key={index} className="p-3">
                    {money(value)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-500 dark:text-slate-400">
        Base mínima: recebimentos de clientes menos faturamento, limitada a zero. Base máxima: base
        mínima mais empresas vinculadas, sócios e espécie. Arredondamento em centavos somente na
        apresentação de cada cálculo.
      </p>
    </section>
  );
}
