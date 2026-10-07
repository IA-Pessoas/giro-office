import { readFileSync } from "node:fs";
import { ServiceError } from "@workspace/shared";
import PDFDocument from "pdfkit";

const RED = "#cf6363";
const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const LEFT = 38;
const WIDTH = PAGE_WIDTH - LEFT * 2;
const BOTTOM = PAGE_HEIGHT - 40;

type Guidance = Record<string, unknown>;
type JsonRow = Record<string, unknown>;

function object(value: unknown): JsonRow {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRow) : {};
}

function rows(value: unknown): JsonRow[] {
  return Array.isArray(value) ? value.map(object) : [];
}

function text(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

function first(...values: unknown[]): string {
  return values.map(text).find(Boolean) ?? "";
}

function documentNumber(value: unknown): string {
  const raw = text(value);
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 11) return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  if (digits.length === 14) {
    return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  }
  return raw;
}

function money(value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  const amount = Number(value);
  return Number.isFinite(amount)
    ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(amount)
    : text(value);
}

const alterationTopics = [
  "NATUREZA JURIDICA",
  "RAZÃO SOCIAL",
  "NOME FANTASIA",
  "ENDEREÇO NO MESMO MUNICIPIO",
  "ENDEREÇO EM MUNICIPIOS DIFERENTES",
  "ENDEREÇO EM UF DIFERENTE",
  "CAPITAL SOCIAL",
  "QUADRO SOCIETARIO",
  "ABERTURA DE FILIAL",
  "ATIVIDADES",
  "RESPONSÁVEL LEGAL",
  "PORTE",
  "REGIME",
  "ENDEREÇO DO SÓCIO",
  "QUALIFICAÇÃO DO SÓCIO",
  "ESTADO CIVIL DO SÓCIO",
] as const;

function key(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toUpperCase();
}

function drawHeader(doc: PDFKit.PDFDocument, company: string, continuation = false): number {
  doc
    .roundedRect(LEFT, 25, WIDTH, continuation ? 67 : 110, 12)
    .lineWidth(2.5)
    .stroke(RED);
  doc.roundedRect(LEFT + 2, 27, WIDTH - 4, 18, 10).fill(RED);
  if (!continuation) {
    const logo = readFileSync(new URL("../assets/Regularize.png", import.meta.url));
    doc.image(logo, LEFT + 18, 51, { fit: [126, 65] });
  }
  doc
    .font("Helvetica-Bold")
    .fontSize(continuation ? 15 : 18)
    .fillColor("#1c1c1c");
  doc.text("ORIENTAÇÃO PROCESSUAL", continuation ? LEFT + 22 : LEFT + 164, continuation ? 53 : 66, {
    width: continuation ? WIDTH - 44 : WIDTH - 182,
    align: continuation ? "left" : "center",
  });
  if (!continuation && company) {
    doc
      .font("Helvetica")
      .fontSize(9)
      .text(company, LEFT + 164, 99, {
        width: WIDTH - 182,
        align: "center",
      });
  }
  return continuation ? 106 : 149;
}

class GuidancePdfLayout {
  private y: number;
  private readonly doc: PDFKit.PDFDocument;

  constructor(private readonly company: string) {
    this.doc = new PDFDocument({
      size: "A4",
      margin: 0,
      compress: true,
      info: {
        Title: "Orientação Processual",
        Author: "Regularize",
      },
    });
    this.y = drawHeader(this.doc, company);
  }

  private page(): void {
    this.doc.addPage();
    this.y = drawHeader(this.doc, this.company, true);
  }

  private room(height: number): void {
    if (this.y + height > BOTTOM) this.page();
  }

  private takeText(raw: string, width: number, available: number): [string, string] {
    let cut = raw.length;
    if (this.doc.heightOfString(raw, { width }) > available) {
      let low = 1;
      let high = raw.length;
      while (low < high) {
        const middle = Math.ceil((low + high) / 2);
        if (this.doc.heightOfString(raw.slice(0, middle), { width }) <= available) low = middle;
        else high = middle - 1;
      }
      cut = low;
      const wordBoundary = raw.lastIndexOf(" ", cut);
      if (wordBoundary > cut / 2) cut = wordBoundary;
    }
    return [raw.slice(0, cut).trimEnd(), raw.slice(cut).trimStart()];
  }

  section(title: string, followingHeight = 0): void {
    this.room(47 + followingHeight);
    this.y += 10;
    this.doc.roundedRect(LEFT, this.y, WIDTH, 27, 8).fill(RED);
    this.doc
      .font("Helvetica-Bold")
      .fontSize(13)
      .fillColor("#ffffff")
      .text(title, LEFT + 12, this.y + 6, {
        width: WIDTH - 24,
        align: "center",
      });
    this.y += 27;
  }

  field(label: string, rawValue: string): void {
    let remaining = rawValue || " ";
    let continued = false;
    do {
      this.room(40);
      const available = BOTTOM - this.y - 16;
      const valueWidth = label ? WIDTH * 0.71 - 14 : WIDTH - 20;
      this.doc.font("Helvetica").fontSize(9);
      const [chunk, rest] = this.takeText(remaining, valueWidth, available);
      remaining = rest;
      const rowHeight = Math.max(31, this.doc.heightOfString(chunk, { width: valueWidth }) + 15);
      this.room(rowHeight);
      this.doc.rect(LEFT, this.y, WIDTH, rowHeight).lineWidth(0.8).stroke(RED);
      if (label)
        this.doc
          .font("Helvetica-Bold")
          .fontSize(8)
          .fillColor("#222222")
          .text(continued ? `${label} (CONT.)` : label, LEFT + 10, this.y + 9, {
            width: WIDTH * 0.27 - 15,
          });
      this.doc
        .font("Helvetica")
        .fontSize(9)
        .fillColor("#222222")
        .text(chunk, label ? LEFT + WIDTH * 0.29 : LEFT + 10, this.y + 8, {
          width: valueWidth,
        });
      this.y += rowHeight;
      continued = true;
    } while (remaining);
  }

  paragraph(value: string): void {
    this.field("", value);
  }

  checkboxParagraph(value: string): void {
    this.room(72);
    this.doc.font("Helvetica").fontSize(9);
    const height = Math.max(31, this.doc.heightOfString(value, { width: WIDTH - 45 }) + 15);
    this.doc.rect(LEFT, this.y, WIDTH, height).lineWidth(0.8).stroke(RED);
    this.doc.rect(LEFT + 10, this.y + 9, 9, 9).stroke("#222222");
    this.doc.fillColor("#222222").text(value, LEFT + 25, this.y + 8, { width: WIDTH - 45 });
    this.y += height;
  }

  partnerCards(cards: readonly (readonly [string, string][])[]): void {
    const half = WIDTH / 2;
    const valueWidth = half - 108;
    for (let index = 0; index < cards.length; index += 2) {
      const pair = cards.slice(index, index + 2);
      for (let row = 0; row < Math.max(...pair.map((card) => card.length)); row++) {
        const remaining = pair.map((card) => card[row]?.[1] || " ");
        let continued = false;
        do {
          this.room(40);
          this.doc.font("Helvetica").fontSize(8);
          const available = BOTTOM - this.y - 16;
          const fitted = remaining.map((value) => this.takeText(value, valueWidth, available));
          const height = Math.max(
            31,
            ...fitted.map(([chunk]) => this.doc.heightOfString(chunk, { width: valueWidth }) + 15),
          );
          pair.forEach((card, column) => {
            const x = LEFT + column * half;
            this.doc.rect(x, this.y, half, height).lineWidth(0.8).stroke(RED);
            this.doc
              .font("Helvetica-Bold")
              .fontSize(8)
              .fillColor("#222222")
              .text(continued ? `${card[row][0]} (CONT.)` : card[row][0], x + 7, this.y + 8, {
                width: 91,
              });
            this.doc
              .font("Helvetica")
              .fontSize(8)
              .text(fitted[column][0], x + 101, this.y + 8, { width: valueWidth });
          });
          this.y += height;
          fitted.forEach(([, rest], column) => {
            remaining[column] = rest;
          });
          continued = true;
        } while (remaining.some(Boolean));
      }
    }
  }

  columns(items: readonly string[]): void {
    for (let index = 0; index < items.length; index += 3) {
      const remaining = items.slice(index, index + 3);
      const columnWidth = WIDTH / 3;
      do {
        this.room(40);
        this.doc.font("Helvetica").fontSize(8).fillColor("#222222");
        const fitted = remaining.map((item) =>
          this.takeText(item, columnWidth - 16, BOTTOM - this.y - 16),
        );
        const height = Math.max(
          31,
          ...fitted.map(
            ([chunk]) => this.doc.heightOfString(chunk, { width: columnWidth - 16 }) + 14,
          ),
        );
        this.doc.rect(LEFT, this.y, WIDTH, height).lineWidth(0.8).stroke(RED);
        this.doc.font("Helvetica").fontSize(8).fillColor("#222222");
        fitted.forEach(([chunk, rest], column) => {
          this.doc.text(chunk, LEFT + column * columnWidth + 8, this.y + 8, {
            width: columnWidth - 16,
          });
          remaining[column] = rest;
        });
        this.y += height;
      } while (remaining.some(Boolean));
    }
  }

  finish(): Promise<Buffer> {
    const chunks: Buffer[] = [];
    return new Promise<Buffer>((resolve, reject) => {
      this.doc.on("data", (chunk: Buffer) => chunks.push(chunk));
      this.doc.on("end", () => resolve(Buffer.concat(chunks)));
      this.doc.on("error", reject);
      this.doc.end();
    });
  }
}

export async function renderGuidancePdf(guidance: Guidance): Promise<Buffer> {
  if (
    Buffer.byteLength(JSON.stringify(guidance), "utf8") > 32 * 1024 ||
    rows(guidance.partners).length > 50 ||
    rows(guidance.economic_activities).length > 100
  ) {
    throw new ServiceError(422, "A orientação é extensa demais para gerar o PDF.");
  }
  const snapshot = object(guidance.target_snapshot);
  const isCompany = guidance.target_type === "PJ" || Boolean(first(guidance.company_name));
  const company = first(
    guidance.company_name,
    snapshot.company_name,
    isCompany ? snapshot.name : "",
  );
  const request = first(guidance.request, snapshot.request, guidance.type);
  const mainDocument = first(guidance.cpf_cnpj, snapshot.cpf_cnpj, snapshot.document);
  if (!company && !request && !first(guidance.comporate_purpose, snapshot.comporate_purpose)) {
    throw new ServiceError(422, "A orientação não possui dados suficientes para gerar o PDF.");
  }

  const pdf = new GuidancePdfLayout(first(company, snapshot.name));
  pdf.section("SOLICITAÇÃO");
  const isAlteration = key(request).includes("ALTERACAO CONTRATUAL");
  if (isAlteration) {
    const changes = request.replace(/^.*?ALTERA(?:Ç|C)[ÃA]O CONTRATUAL\s*-?/iu, "").trim();
    pdf.paragraph("ALTERAÇÕES REALIZADAS:");
    pdf.columns(
      (changes || request).split(/[,;]/).map((change, index) => `${index + 1}. ${change.trim()}`),
    );
    pdf.field("OBS-", first(guidance.framework_obs, snapshot.framework_obs));
  } else if (key(request) === "CONSTITUICAO") {
    pdf.paragraph(first(guidance.framework_obs, snapshot.framework_obs));
  } else {
    pdf.field("", request);
    pdf.field("", first(guidance.framework_obs, snapshot.framework_obs));
  }

  pdf.section("INFORMAÇÕES");
  for (const [label, value] of [
    ["NATUREZA JURÍDICA", first(guidance.legal_nature, snapshot.legal_nature)],
    ["RAZÃO SOCIAL", company],
    ["NOME FANTASIA", first(guidance.trade_name, snapshot.trade_name)],
    ["CNPJ", mainDocument.replace(/\D/g, "").length === 14 ? documentNumber(mainDocument) : ""],
    ["CAPITAL SOCIAL", money(guidance.share_capital ?? snapshot.share_capital)],
    ["IPTU", first(guidance.iptu, snapshot.iptu)],
    ["PORTE", first(guidance.carryng, snapshot.carryng)],
    ["REGIME", first(guidance.regime, snapshot.regime)],
    ["REPRESENTANTE LEGAL", first(guidance.legal_representative, snapshot.legal_representative)],
    ["ENDEREÇO", first(guidance.address, snapshot.address)],
  ])
    pdf.field(label, value);

  const branch = object(guidance.branch_data);
  if (Object.keys(branch).length) {
    pdf.section("FILIAL");
    pdf.field("NOME", text(branch.name));
    pdf.field("CNPJ", documentNumber(branch.document));
    pdf.field("IPTU", "");
    pdf.field(
      "ENDEREÇO",
      [branch.address, branch.city, branch.state].map(text).filter(Boolean).join(", "),
    );
    pdf.field("ATIVIDADES", "");
    pdf.field("OBJETO SOCIAL", "");
  }

  const activities = rows(guidance.economic_activities);
  pdf.section("ATIVIDADES ECONÔMICAS");
  pdf.field(
    "ATIVIDADE PRINCIPAL",
    activities
      .filter((row) => row.type === "Principal")
      .map((row) => [row.code, row.description].map(text).filter(Boolean).join(" - "))
      .join("\n"),
  );
  pdf.field(
    "ATIVIDADES SECUNDÁRIAS",
    activities
      .filter((row) => row.type !== "Principal")
      .map((row) => [row.code, row.description].map(text).filter(Boolean).join(" - "))
      .join("\n"),
  );

  pdf.section("OBJETO SOCIAL");
  pdf.paragraph(first(guidance.comporate_purpose, snapshot.comporate_purpose));

  pdf.section("QUADRO SOCIETÁRIO");
  const partners = rows(guidance.partners).sort(
    (a, b) => Number(b.percentage ?? b.share ?? 0) - Number(a.percentage ?? a.share ?? 0),
  );
  pdf.partnerCards(
    partners.map((partner) => [
      ["SÓCIO(A)", text(partner.name)],
      [
        "PORCENTAGEM",
        partner.percentage === undefined && partner.share === undefined
          ? ""
          : `${text(partner.percentage ?? partner.share)}%`,
      ],
      ["PROFISSÃO", text(partner.profession)],
      ["ESTADO CIVIL", text(partner.marital_status)],
      [text(partner.cnh) ? "CNH" : "RG", first(partner.cnh, partner.rg)],
      ["CPF", documentNumber(partner.cpf)],
      ["ENDEREÇO RESIDENCIAL", text(partner.address)],
      ["CARGO", text(partner.role)],
    ]),
  );

  const notAltered = isAlteration
    ? alterationTopics.filter((topic) => !key(request).includes(key(topic)))
    : [];
  pdf.section("NÃO ALTERADO", Math.ceil(notAltered.length / 3) * 36);
  pdf.columns(notAltered);

  pdf.section("DECLARAÇÃO DE CIÊNCIA");
  pdf.paragraph("Eu, _____________________________________________________________");
  pdf.paragraph("portador(a) da CARTEIRA DE IDENTIDADE Nº _____________________________");
  pdf.checkboxParagraph(
    "Estou ciente da solicitação e uso dos dados pessoais supracitados nesta orientação processual, conforme as leis governamentais, seguindo os preceitos da Lei 13.709/2018 - LGPD.",
  );
  pdf.paragraph(`_________ de __________ de ${new Date().getFullYear()}, FEIRA DE SANTANA - BA`);
  pdf.paragraph(
    "___________________________________________________________________________\nASSINATURA",
  );

  return pdf.finish();
}
