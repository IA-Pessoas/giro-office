import type { ContingencyResult, ContingencyReview } from "./contingencyService.js";

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char,
  );
const money = (cents: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);

export function renderContingencyReport(
  result: ContingencyResult,
  review: ContingencyReview,
): string {
  const p = result.parameters;
  const rows = result.extraction
    .map(
      (item) => `<tr>
    <th scope="row">${escapeHtml(item.label)}</th><td>${money(item.valueCents)}</td>
    <td>${escapeHtml(`${item.sheet}!${item.valueCell} · ${item.sourceLabel} (${item.labelCell})`)}</td>
  </tr>`,
    )
    .join("\n");
  const scenarios = (
    [
      ["Mínimo", result.minimum],
      ["Máximo", result.maximum],
    ] as const
  )
    .map(
      ([label, value]) =>
        `<tr><th scope="row">${label}</th>${[
          value.baseCents,
          value.taxCents,
          value.penaltyCents,
          value.interestCents,
          value.totalCents,
        ]
          .map((cents) => `<td>${money(cents)}</td>`)
          .join("")}</tr>`,
    )
    .join("\n");
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<title>Simulação legada de Contingência — ${escapeHtml(p.company_name)}</title>
<style>
  body { max-width: 1000px; margin: 32px auto; padding: 0 20px; font: 14px/1.5 sans-serif; color: #111; }
  h1 { font-size: 24px; } h2 { font-size: 18px; margin-top: 24px; }
  table { border-collapse: collapse; width: 100%; margin: 12px 0; }
  th, td { border: 1px solid #bbb; padding: 8px; text-align: left; overflow-wrap: anywhere; }
  th { background: #f3f4f6; } p { overflow-wrap: anywhere; }
  @page { size: A4 landscape; margin: 14mm; }
  @media print { body { margin: 0; padding: 0; font-size: 10pt; } tr { break-inside: avoid; } thead { display: table-header-group; } }
</style></head><body>
<h1>Simulação legada de Contingência</h1>
<p><strong>${escapeHtml(p.company_name)}</strong> · CNPJ ${escapeHtml(p.cnpj)}<br>
Período: ${escapeHtml(p.period_start)} a ${escapeHtml(p.period_end)} · ${escapeHtml(p.regime)}
${p.annex ? ` · Anexo ${escapeHtml(p.annex)}` : ""} · Alíquota: ${p.rate}%<br>
Arquivo: ${escapeHtml(p.filename)}</p>
<h2>Hipóteses e limites</h2>
<p>Modelo legado para simulação. As classificações são hipóteses sujeitas a conferência e documentação;
os valores não comprovam irregularidade fiscal. Empresas vinculadas, transferências de sócios e
depósitos em espécie são possíveis receitas sem documentação, incluídas apenas na base máxima.
Operações de crédito são tratadas como origem financeira regular, fora da base de receita.</p>
<p>${result.identity === "matched" ? "O CNPJ do XLS corresponde à empresa selecionada." : "O XLS não contém identificação de CNPJ; a vinculação à empresa depende da conferência."}</p>
<h2>Valores extraídos</h2>
<table><thead><tr><th>Item</th><th>Valor</th><th>Origem no XLS</th></tr></thead><tbody>${rows}</tbody></table>
<p>Diferença identificada (bancos menos faturamento): ${money(result.differenceCents)}.<br>
Hipótese de transferências internas entre contas PJ: ${money(result.internalTransfersCents)}.</p>
<h2>Cenários estimados</h2>
<table><thead><tr><th>Cenário</th><th>Base</th><th>Tributo</th><th>Multa (75%)</th><th>Juros (6%)</th><th>Total</th></tr></thead><tbody>${scenarios}</tbody></table>
<p>Base mínima: recebimentos de clientes menos faturamento, limitada a zero. Base máxima: base mínima
mais empresas vinculadas, sócios e espécie. Arredondamento em centavos na apresentação de cada cálculo.</p>
<h2>Conferência registrada</h2>
<p>Ator: ${escapeHtml(review.reviewed_by)}<br>Instante (UTC): ${review.reviewed_at.toISOString()}<br>
Hash SHA-256 do conteúdo conferido: ${escapeHtml(review.reviewed_hash)}</p>
</body></html>`;
}
