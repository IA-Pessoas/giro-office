import { deflateSync } from "node:zlib";
import { ServiceError } from "@workspace/shared";
import { describe, expect, it } from "vitest";

import { extractPdfText } from "../utils/pdf.js";

const MB = 1024 * 1024;
const HEADER = "%PDF-1.7\n";

function pdf(...parts: (string | Buffer)[]): Buffer {
  return Buffer.concat(
    parts.map((part) => (Buffer.isBuffer(part) ? part : Buffer.from(part, "latin1"))),
  );
}

function flateObject(id: number, dict: string, content: string | Buffer): Buffer {
  const payload = deflateSync(Buffer.isBuffer(content) ? content : Buffer.from(content, "latin1"));
  return pdf(
    `${id} 0 obj\n<< ${dict} /Filter /FlateDecode /Length ${payload.length} >>\nstream\n`,
    payload,
    "\nendstream\nendobj\n",
  );
}

/** Barra o tempo de parede: cada caso hostil deve terminar em milissegundos, não em minutos. */
function elapsedMs(run: () => void): number {
  const started = process.hrtime.bigint();
  try {
    run();
  } catch {
    // O custo é o que está sob teste; a mensagem tem cobertura própria nas rotas.
  }
  return Number(process.hrtime.bigint() - started) / 1e6;
}

describe("extractPdfText", () => {
  it("lê texto de content stream comprimido", () => {
    const content = "BT\n/F1 12 Tf\n72 720 Td\n(Pauta da reunião) Tj\n0 -14 Td\n(Ações) Tj\nET\n";
    const file = pdf(HEADER, flateObject(1, "", content));

    expect(extractPdfText(file)).toBe("Pauta da reunião\nAções");
  });

  it("aplica o /ToUnicode de fonte incorporada e ignora objetos fora da página", () => {
    const cmap = [
      "begincmap",
      "1 begincodespacerange",
      "<0000> <FFFF>",
      "endcodespacerange",
      "2 beginbfchar",
      "<0001> <0041>",
      "<0002> <00e7>",
      "endbfchar",
      "1 beginbfrange",
      "<0003> <0005> <0061>",
      "endbfrange",
      "endcmap",
    ].join("\n");

    const file = pdf(
      HEADER,
      "1 0 obj\n<< /Type /Page /Resources << /Font << /F1 2 0 R >> >> >>\nendobj\n",
      "2 0 obj\n<< /Type /Font /ToUnicode 3 0 R >>\nendobj\n",
      flateObject(3, "", cmap),
      flateObject(4, "", "BT\n/F1 12 Tf\n<00010002000300040005> Tj\nET\n"),
      "5 0 obj\n<< /S /JavaScript /JS (app.alert\\('x'\\)) >>\nendobj\n",
    );

    expect(extractPdfText(file)).toBe("Açabc");
  });

  it("expande objetos comprimidos em /Type /ObjStm", () => {
    const packed = "<< /Type /Font /ToUnicode 4 0 R >>";
    const header = `2 0 `;
    const file = pdf(
      HEADER,
      "1 0 obj\n<< /Font << /F1 2 0 R >> >>\nendobj\n",
      flateObject(3, `/Type /ObjStm /N 1 /First ${header.length}`, header + packed),
      flateObject(
        4,
        "",
        "begincmap\n1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange\n1 beginbfchar\n<0007> <004f>\nendbfchar\nendcmap",
      ),
      flateObject(5, "", "BT\n/F1 12 Tf\n<0007> Tj\nET\n"),
    );

    expect(extractPdfText(file)).toBe("O");
  });

  it("descarta streams de imagem sem acionar OCR", () => {
    const file = pdf(
      HEADER,
      "1 0 obj\n<< /Type /Page /Contents 2 0 R >>\nendobj\n",
      flateObject(2, "", "q 468 0 0 648 72 72 cm /Im1 Do Q\n"),
      "3 0 obj\n<< /Type /XObject /Subtype /Image /Filter /DCTDecode /Length 4 >>\nstream\n\xff\xd8\xff\xd9\nendstream\nendobj\n",
    );

    expect(extractPdfText(file)).toBe("");
  });

  it.each([
    ["dicionário direto", "trailer\n<< /Encrypt << /Filter /Standard /V 2 >> >>\n"],
    ["referência indireta", "trailer\n<< /Encrypt 9 0 R >>\n"],
  ])("recusa PDF cifrado declarado por %s", (_label, trailer) => {
    const file = pdf(HEADER, flateObject(1, "", "BT (Segredo) Tj ET\n"), trailer);

    expect(() => extractPdfText(file)).toThrow(ServiceError);
    expect(() => extractPdfText(file)).toThrow(/protegido por senha/);
  });

  it("limita o total descomprimido do documento", () => {
    const bomb = deflateSync(Buffer.alloc(7 * MB, 0x20));
    const objects = Array.from({ length: 20 }, (_unused, index) =>
      pdf(
        `${index + 1} 0 obj\n<< /Filter /FlateDecode /Length ${bomb.length} >>\nstream\n`,
        bomb,
        "\nendstream\nendobj\n",
      ),
    );

    const before = process.memoryUsage().heapUsed;
    expect(() => extractPdfText(pdf(HEADER, ...objects))).toThrow(/corrompido/);
    // 140 MB declarados; o teto do documento mantém o pico em poucas dezenas de MB.
    expect((process.memoryUsage().heapUsed - before) / MB).toBeLessThan(80);
  });

  it.each([
    [
      "milhares de cabeçalhos sem endobj",
      () => pdf(HEADER, "1 0 obj ".repeat(Math.floor((6 * MB) / 8))),
    ],
    [
      "blocos stream sem endstream",
      () => pdf(HEADER, "endobj\n", "1 0 obj\n<<>>\nstream\n".repeat(Math.floor((4 * MB) / 20))),
    ],
    [
      "/ToUnicode com ranges gigantes",
      () =>
        pdf(
          HEADER,
          "1 0 obj\n<< /Font << /F1 2 0 R >> >>\nendobj\n2 0 obj\n<< /ToUnicode 3 0 R >>\nendobj\n",
          flateObject(
            3,
            "",
            `begincmap\n1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange\nbeginbfrange\n${"<0000> <ffff> <0041>\n".repeat(50_000)}endbfrange\nendcmap`,
          ),
        ),
    ],
    [
      "recursos /Font sem fechamento",
      () => pdf(HEADER, `1 0 obj\n${"/Font << ".repeat(Math.floor((4 * MB) / 9))}\nendobj\n`),
    ],
  ])("resolve %s em tempo linear", (_label, build) => {
    const file = build();

    expect(elapsedMs(() => extractPdfText(file))).toBeLessThan(5_000);
  });
});
