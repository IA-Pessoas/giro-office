/**
 * Rola o relatório (dentro de um Dialog) ao topo e abre a impressão do navegador. O
 * `@media print` de `global.css` mostra só o elemento com a classe `print-report`.
 */
export function printReport(reportId: string): void {
  const report = document.getElementById(reportId);
  for (let element = report; element; element = element.parentElement) element.scrollTop = 0;
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
  window.scrollTo(0, 0);
  window.print();
}
