/** Rola o relatório (dentro do Dialog) ao topo e abre a impressão; o CSS de `@media print` isola o id. */
export function printMarketingReport(reportId: string): void {
  const report = document.getElementById(reportId);
  for (let element = report; element; element = element.parentElement) element.scrollTop = 0;
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
  window.scrollTo(0, 0);
  window.print();
}
