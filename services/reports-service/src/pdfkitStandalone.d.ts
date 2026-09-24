// O build standalone do pdfkit nao traz tipos; ReportPdfService usa PdfDocumentLike.
declare module "pdfkit/js/pdfkit.standalone.js" {
  const PdfDocument: unknown;
  export default PdfDocument;
}
