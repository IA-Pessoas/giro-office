import { describe, expect, it } from "vitest";

import {
  DTE_IMPORT_LIMITS,
  dteDedupeKey,
  parseDteDateTime,
  parseDteImport,
} from "../services/dteImportParser.js";

describe("parseDteDateTime", () => {
  it("lê dd/mm/aaaa com ou sem hora, como o legado", () => {
    expect(parseDteDateTime("05/03/2024 10:22")).toEqual(new Date("2024-03-05T10:22:00.000Z"));
    expect(parseDteDateTime("05/03/2024")).toEqual(new Date("2024-03-05T00:00:00.000Z"));
  });

  it("devolve null para texto fora do formato ou data que não existe", () => {
    expect(parseDteDateTime(null)).toBeNull();
    expect(parseDteDateTime("2024-03-05")).toBeNull();
    expect(parseDteDateTime("31/02/2024 10:00")).toBeNull();
    expect(parseDteDateTime("05/03/2024 25:00")).toBeNull();
  });
});

// Tabela sintética no formato que o regularize/pages/dte/upload.php lia: aviso na célula 3
// (com o span cuja classe vira o tipo), CNPJ na 4 e datas nas 7, 9 e 10.
function row(cells: string[]): string {
  return `<tr>${cells.map((cell) => `<td>${cell}</td>`).join("")}</tr>`;
}

const fullRow = row([
  '<input type="checkbox">',
  "1",
  '<span class="badge badge-important">Aviso &#8470; 12</span>',
  "12.345.678/0001-90",
  "Empresa Sint&eacute;tica LTDA",
  "SEFAZ &amp; Receita",
  "05/03/2024 10:22",
  "Intima&ccedil;&atilde;o",
  "-",
  "",
]);

describe("parseDteImport (HTML)", () => {
  it("extrai a primeira tabela com os campos legados e ignora as demais", () => {
    const html = `<html><body><p>topo</p><table><thead><tr><th>Aviso</th></tr></thead>
      <tbody>${fullRow}</tbody></table>
      <table>${row(["a", "b", "outra tabela", "d", "e"])}</table></body></html>`;

    const result = parseDteImport("html", html);

    expect(result.notices).toEqual([
      {
        row: 2,
        fields: {
          tipo: "badge badge-important",
          aviso: "Aviso № 12",
          cnpj_cpf: "12.345.678/0001-90",
          destinatario: "Empresa Sintética LTDA",
          remetente: "SEFAZ & Receita",
          data_emissao: "05/03/2024 10:22",
          assunto: "Intimação",
          data_leitura: null,
          data_ciencia: null,
          registro: null,
        },
        pendingReading: true,
      },
    ]);
    expect(result.totalRows).toBe(2);
  });

  it("ignora linhas com menos de cinco células sem criar aviso falso", () => {
    const html = `<table>${row(["1", "2", "3", "4"])}<tr><th>só cabeçalho</th></tr>${fullRow}</table>`;

    const result = parseDteImport("html", html);

    expect(result.notices).toHaveLength(1);
    expect(result.notices[0]?.row).toBe(3);
    expect(result.rejections).toEqual([
      { row: 1, reason: "LINHA_INCOMPLETA" },
      { row: 2, reason: "LINHA_INCOMPLETA" },
    ]);
  });

  it("completa com vazio as células ausentes e tipo vazio sem span, como o PHP", () => {
    const result = parseDteImport(
      "html",
      `<table>${row(["1", "2", "Aviso", "123", "Dest"])}</table>`,
    );

    expect(result.notices[0]?.fields).toMatchObject({
      tipo: "",
      aviso: "Aviso",
      cnpj_cpf: "123",
      destinatario: "Dest",
      remetente: "",
      data_emissao: null,
      assunto: "",
    });
    expect(result.notices[0]?.pendingReading).toBe(false);
  });

  it("não executa nem guarda script, estilo ou atributos de evento", () => {
    const html = `<table>${row([
      "1",
      "2",
      '<span class="badge badge-warning" onclick="alert(1)">Aviso<script>alert("x")</script></span>',
      "<style>td{}</style>123",
      "<img src=x onerror=alert(1)>Dest",
    ])}</table>`;

    const result = parseDteImport("html", html);

    expect(result.notices[0]?.fields).toMatchObject({
      tipo: "badge badge-warning",
      aviso: "Aviso",
      cnpj_cpf: "123",
      destinatario: "Dest",
    });
    expect(JSON.stringify(result)).not.toMatch(/alert|onerror|<script/);
  });

  it("rejeita linha em que todos os campos-chave vêm vazios", () => {
    const result = parseDteImport("html", `<table>${row(["1", "2", " ", "", "", ""])}</table>`);

    expect(result.notices).toEqual([]);
    expect(result.rejections).toEqual([{ row: 1, reason: "SEM_DADOS" }]);
  });

  it("recusa HTML sem tabela ou sem linhas", () => {
    expect(() => parseDteImport("html", "<p>nada</p>")).toThrow(/Tabela não encontrada/);
    expect(() => parseDteImport("html", "<table></table>")).toThrow(/Nenhuma linha/);
  });

  it("limita tamanho e complexidade", () => {
    expect(() =>
      parseDteImport("html", "x".repeat(DTE_IMPORT_LIMITS.maxContentLength + 1)),
    ).toThrow(/tamanho/);
    expect(() =>
      parseDteImport("html", `<table>${"<b>".repeat(DTE_IMPORT_LIMITS.maxTags + 1)}</table>`),
    ).toThrow(/complex/);
    const manyRows = `<table>${"<tr><td>1</td></tr>".repeat(DTE_IMPORT_LIMITS.maxRows + 1)}</table>`;
    expect(() => parseDteImport("html", manyRows)).toThrow(/linhas/);
  });

  it("rejeita campo longo demais em vez de truncar", () => {
    const long = "a".repeat(DTE_IMPORT_LIMITS.maxFieldLength + 1);
    const result = parseDteImport("html", `<table>${row(["1", "2", long, "4", "5"])}</table>`);

    expect(result.notices).toEqual([]);
    expect(result.rejections).toEqual([{ row: 1, reason: "CAMPO_LONGO" }]);
  });
});

describe("parseDteImport (JSON)", () => {
  it("lê o JSON exportado pelo legado com registro e datas '-'", () => {
    const json = JSON.stringify([
      {
        tipo: "badge badge-info",
        cell3: "Aviso 1",
        cell4: "123",
        cell5: "Dest",
        cell6: "Rem",
        cell7: "-",
        cell8: "Assunto",
        cell9: "06/03/2024",
        cell10: "-",
        registro: "07/03/2024",
      },
    ]);

    const result = parseDteImport("json", json);

    expect(result.notices).toEqual([
      {
        row: 1,
        fields: {
          tipo: "badge badge-info",
          aviso: "Aviso 1",
          cnpj_cpf: "123",
          destinatario: "Dest",
          remetente: "Rem",
          data_emissao: null,
          assunto: "Assunto",
          data_leitura: "06/03/2024",
          data_ciencia: null,
          registro: "07/03/2024",
        },
        pendingReading: false,
      },
    ]);
  });

  it("rejeita itens que não são objeto ou com campo não escalar", () => {
    const json = JSON.stringify(["texto", null, { cell3: { x: 1 } }, { cell3: "ok", cell4: 1 }]);

    const result = parseDteImport("json", json);

    expect(result.rejections).toEqual([
      { row: 1, reason: "ITEM_INVALIDO" },
      { row: 2, reason: "ITEM_INVALIDO" },
      { row: 3, reason: "CAMPO_INVALIDO" },
    ]);
    expect(result.notices[0]?.fields.cnpj_cpf).toBe("1");
  });

  it("recusa a linha com NUL em vez de perder o lote no banco", () => {
    const result = parseDteImport("json", JSON.stringify([{ cell3: "a\u0000b" }, { cell3: "ok" }]));

    expect(result.rejections).toEqual([{ row: 1, reason: "CAMPO_INVALIDO" }]);
    expect(result.notices).toHaveLength(1);
  });

  it("gera a mesma chave para o mesmo aviso colado em HTML e em JSON com espaços", async () => {
    const [fromHtml] = parseDteImport(
      "html",
      `<table>${row(["1", "2", " Aviso 1 ", "123", "Dest"])}</table>`,
    ).notices;
    const [fromJson] = parseDteImport(
      "json",
      JSON.stringify([{ tipo: "", cell3: " Aviso 1 ", cell4: "123 ", cell5: "Dest" }]),
    ).notices;
    if (!fromHtml || !fromJson) throw new Error("aviso sintético não foi lido");

    expect(await dteDedupeKey(fromJson.fields)).toBe(await dteDedupeKey(fromHtml.fields));
  });

  it("acha o fim do script mesmo quando minúsculas mudam o tamanho do texto", () => {
    const html = `${"İ".repeat(10)}<table>${row(["1", "2", "<script>x</script>Aviso", "123", "Dest"])}</table>`;

    expect(parseDteImport("html", html).notices[0]?.fields.aviso).toBe("Aviso");
  });

  it("recusa JSON inválido ou que não é lista", () => {
    expect(() => parseDteImport("json", "{")).toThrow(/JSON inválido/);
    expect(() => parseDteImport("json", '{"a":1}')).toThrow(/lista/);
  });
});

describe("dteDedupeKey", () => {
  const [first] = parseDteImport("html", `<table>${fullRow}</table>`).notices;
  if (!first) throw new Error("aviso sintético não foi lido");
  const base = first.fields;

  it("usa só os nove campos do legado: registro não muda a chave", async () => {
    expect(await dteDedupeKey(base)).toBe(await dteDedupeKey({ ...base, registro: "x" }));
    expect(await dteDedupeKey(base)).not.toBe(await dteDedupeKey({ ...base, assunto: "outro" }));
    expect(await dteDedupeKey(base)).toMatch(/^[0-9a-f]{64}$/);
  });
});
