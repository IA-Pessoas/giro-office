// Tipos mínimos do build standalone do pdfkit usado pela folha de ponto.
declare module "pdfkit/js/pdfkit.standalone.js" {
  export default class PdfDocument {
    constructor(options: { size: "A4"; margin: number; info: { Title: string; Author: string } });
    on(event: string, listener: (value?: unknown) => void): this;
    addPage(options?: { size: "A4"; margin: number }): this;
    fillColor(color: string): this;
    fontSize(size: number): this;
    text(value: string, x: number, y: number, options?: Record<string, unknown>): this;
    moveTo(x: number, y: number): this;
    lineTo(x: number, y: number): this;
    stroke(): this;
    image(
      source: ArrayBuffer | string,
      x: number,
      y: number,
      options: { fit: [number, number] },
    ): this;
    end(): void;
  }
}
