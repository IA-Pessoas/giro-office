import { describe, expect, it } from "vitest";
import { convertNoahZip, NOAH_LIMITS } from "../services/noahConversionService.js";
import { noahHtml, noahZip } from "./noahFixtures.js";

describe("conversão Noah", () => {
  it("converte a tabela e suas duas posições legadas sem executar HTML", async () => {
    const result = await convertNoahZip(await noahZip());
    expect(result).toEqual({
      csv: "FORNECEDOR;DATA;VALOR;ARQUIVO\r\nFornecedor & Cia;09/10/2026;1.234,56;comprovante.html\r\nOutro fornecedor;08/10/2026;50,00;comprovante.html\r\n",
      rowCount: 2,
      fileCount: 1,
      rejections: [],
    });
  });

  it("retorna rejeições por arquivo sem descartar outros comprovantes", async () => {
    const result = await convertNoahZip(
      await noahZip({
        "ok.html": noahHtml,
        "sem-tabela.html": "<p>Outro documento</p>",
        "data.html": noahHtml.replace("09/10/2026", "31/02/2026"),
        "valor.html": noahHtml.replace("1.234,56", "valor inválido"),
        "foto.png": "conteúdo inválido",
      }),
    );
    expect(result.rowCount).toBe(2);
    expect(result.fileCount).toBe(5);
    expect(result.rejections.map(({ file }) => file)).toEqual([
      "sem-tabela.html",
      "data.html",
      "valor.html",
      "foto.png",
    ]);
  });

  it("neutraliza fórmulas e mantém quatro colunas mesmo com separadores no texto", async () => {
    const result = await convertNoahZip(
      await noahZip({
        "comprovante.html": noahHtml.replace(
          "Fornecedor &amp; Cia",
          "=1+1; &quot;Fornecedor&quot;",
        ),
      }),
    );
    expect(result.csv).toContain('"\'=1+1; ""Fornecedor""";09/10/2026;1.234,56;comprovante.html');
  });

  it.each([
    "../escape.html",
    "/absoluto.html",
    "C:\\escape.html",
  ])("recusa caminho inseguro %s", async (name) => {
    await expect(convertNoahZip(await noahZip({ [name]: noahHtml }))).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it("limita ZIP, quantidade de entradas e tamanho expandido antes de extrair", async () => {
    await expect(convertNoahZip(Buffer.alloc(NOAH_LIMITS.zipBytes + 1))).rejects.toMatchObject({
      statusCode: 413,
    });
    await expect(
      convertNoahZip(
        await noahZip(
          Object.fromEntries(
            Array.from({ length: 101 }, (_, index) => [`${index}.html`, noahHtml]),
          ),
        ),
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
    const result = await convertNoahZip(
      await noahZip({
        "grande.html": "a".repeat(NOAH_LIMITS.fileBytes + 1),
        "ok.html": noahHtml,
      }),
    );
    expect(result.rejections).toEqual([{ file: "grande.html", reason: "Arquivo excede 1 MiB." }]);
    await expect(
      convertNoahZip(
        await noahZip(
          Object.fromEntries(
            Array.from({ length: 11 }, (_, index) => [
              `${index}.html`,
              "a".repeat(NOAH_LIMITS.fileBytes),
            ]),
          ),
        ),
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("recusa arquivos vazios, ZIP corrompido e ZIP sem comprovantes", async () => {
    for (const bytes of [Buffer.alloc(0), Buffer.from("não é ZIP"), await noahZip({})]) {
      await expect(convertNoahZip(bytes)).rejects.toMatchObject({ statusCode: 400 });
    }
  });
});
