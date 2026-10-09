import "./envBootstrap.js";

import { createZip, ServiceError } from "@workspace/shared";
import { describe, expect, it, vi } from "vitest";

import { AnticipationService } from "../services/anticipationService.js";

const organizationId = "a0000000-0000-4000-8000-000000000001";
const userId = "c0000000-0000-4000-8000-000000000001";
const clientId = "d0000000-0000-4000-8000-000000000001";
const ISSUER = "11222333000181";

/** Chave NF-e válida (DV módulo 11) para emitente, série e número. */
function accessKey(number: number, series = 1): string {
  const base = `3526${"10"}${ISSUER}55${String(series).padStart(3, "0")}${String(number).padStart(9, "0")}1${"00000001"}`;
  let weight = 2;
  let sum = 0;
  for (let i = base.length - 1; i >= 0; i -= 1) {
    sum += Number(base[i]) * weight;
    weight = weight === 9 ? 2 : weight + 1;
  }
  const rest = sum % 11;
  return `${base}${rest < 2 ? 0 : 11 - rest}`;
}

function nfe(number: number, items: string[], options: { key?: boolean; cStat?: string } = {}) {
  const id = options.key === false ? "" : ` Id="NFe${accessKey(number)}"`;
  const det = items
    .map(
      (value, index) =>
        `<det nItem="${index + 1}"><prod><cProd>P${index + 1}</cProd><xProd>Produto ${index + 1}</xProd><NCM>22030000</NCM><CFOP>6102</CFOP><qCom>2.0000</qCom><vProd>${value}</vProd></prod><imposto><ICMS><ICMS10><vICMSST>1.50</vICMSST></ICMS10></ICMS></imposto></det>`,
    )
    .join("");
  const protocol = options.cStat
    ? `<protNFe><infProt><cStat>${options.cStat}</cStat></infProt></protNFe>`
    : "";
  return `<nfeProc><NFe><infNFe${id}><ide><mod>55</mod><serie>1</serie><nNF>${number}</nNF></ide><emit><CNPJ>${ISSUER}</CNPJ></emit>${det}<total><ICMSTot><vNF>1</vNF></ICMSTot></total></infNFe></NFe>${protocol}</nfeProc>`;
}

const zipOf = (files: Record<string, string>) =>
  createZip(
    Object.entries(files).map(([fileName, text]) => ({ fileName, body: Buffer.from(text) })),
  ).toString("base64");

const actor = { organizationId, userId, permission: 2 };

function dependencies(
  existing: { access_key: string; item_number: number; batch_id: string }[] = [],
) {
  const createdItems: Record<string, unknown>[] = [];
  const fiscalAnticipationBatch = {
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
      id: "b0000000-0000-4000-8000-000000000001",
      status: "pending_review",
      reviewer_id: null,
      createdAt: new Date("2026-10-09T12:00:00.000Z"),
      updatedAt: new Date("2026-10-09T12:00:00.000Z"),
      ...data,
    })),
    findFirst: vi.fn(async () => null),
    findMany: vi.fn(async () => []),
    count: vi.fn(async () => 0),
  };
  const fiscalAnticipationItem = {
    findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
      where.batch_id ? createdItems : existing,
    ),
    createMany: vi.fn(async ({ data }: { data: Record<string, unknown>[] }) => {
      createdItems.push(...data);
      return { count: data.length };
    }),
  };
  const prisma = {
    client: { findFirst: vi.fn(async () => ({ id: clientId }) as { id: string } | null) },
    fiscalAnticipationBatch,
    fiscalAnticipationItem,
    $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) =>
      callback({ fiscalAnticipationBatch, fiscalAnticipationItem }),
    ),
  };
  const audit = { createLog: vi.fn(async () => undefined) };
  return { prisma, audit, createdItems };
}

const importInput = (files: Record<string, string>) => ({
  ...actor,
  client_id: clientId,
  competence: "2026-09",
  file_name: "notas.zip",
  zip_base64: zipOf(files),
});

describe("AnticipationService.importBatch", () => {
  it("cria lote pendente de revisão com itens rastreáveis, sem calcular imposto", async () => {
    const { prisma, audit, createdItems } = dependencies();
    const service = new AnticipationService(prisma as never, audit);

    const batch = await service.importBatch(importInput({ "100.xml": nfe(100, ["10.00", "5.5"]) }));

    expect(batch).toMatchObject({
      client_id: clientId,
      competence: "2026-09",
      status: "pending_review",
      responsible_id: userId,
      reviewer_id: null,
      entry_count: 1,
      note_count: 1,
      item_count: 2,
      issues: [],
    });
    expect(createdItems).toHaveLength(2);
    expect(createdItems[0]).toMatchObject({
      organization_id: organizationId,
      client_id: clientId,
      entry: "100.xml",
      access_key: accessKey(100),
      note_number: "100",
      item_number: 1,
      ncm: "22030000",
      cfop: "6102",
      quantity: "2",
      value: "10.00",
      icms_st: "1.50",
    });
    expect(batch.items.map((item) => item.item_number)).toEqual([1, 2]);
    expect(JSON.stringify(batch)).not.toMatch(/imposto_devido|tax_due/u);
    expect(audit.createLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "Importação", referring: "fiscal.anticipations" }),
    );
  });

  it("recusa duplicata de chave + item já importada para o cliente e mostra o lote de origem", async () => {
    const { prisma, audit, createdItems } = dependencies([
      { access_key: accessKey(100), item_number: 1, batch_id: "lote-anterior" },
    ]);
    const service = new AnticipationService(prisma as never, audit);

    const batch = await service.importBatch(importInput({ "100.xml": nfe(100, ["10.00", "5.5"]) }));

    expect(createdItems.map((item) => item.item_number)).toEqual([2]);
    expect(batch.issues).toEqual([
      {
        entry: "100.xml",
        kind: "duplicate",
        message: `Chave ${accessKey(100)} item 1 já importada no lote lote-anterior.`,
      },
    ]);
    expect(prisma.fiscalAnticipationItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organization_id: organizationId, client_id: clientId }),
      }),
    );
  });

  it("não escolhe versão quando a mesma chave aparece com conteúdo diferente no lote", async () => {
    const { prisma, audit } = dependencies();
    const service = new AnticipationService(prisma as never, audit);

    const batch = await service.importBatch(
      importInput({
        "a.xml": nfe(100, ["10.00"]),
        "b.xml": nfe(100, ["11.00"]),
        "copia.xml": nfe(101, ["1.00"]),
        "copia-2.xml": nfe(101, ["1.00"]),
      }),
    );

    expect(batch.items.map((item) => item.entry)).toEqual(["copia.xml"]);
    expect(batch.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ entry: "a.xml", kind: "duplicate" }),
        expect.objectContaining({ entry: "b.xml", kind: "duplicate" }),
        { entry: "copia-2.xml", kind: "discarded", message: "Cópia idêntica de copia.xml." },
      ]),
    );
  });

  it("mostra XML inválido, nota sem chave, não autorizada e arquivo não XML por arquivo", async () => {
    const { prisma, audit } = dependencies();
    const service = new AnticipationService(prisma as never, audit);

    const batch = await service.importBatch(
      importInput({
        "ok.xml": nfe(100, ["10.00"]),
        "quebrado.xml": "<NFe>",
        "sem-chave.xml": nfe(102, ["1.00"], { key: false }),
        "denegada.xml": nfe(103, ["1.00"], { cStat: "302" }),
        "leia.txt": "x",
      }),
    );

    expect(batch.item_count).toBe(1);
    expect(batch.entry_count).toBe(5);
    expect(batch.issues).toEqual(
      expect.arrayContaining([
        { entry: "quebrado.xml", kind: "error", message: "XML inválido." },
        {
          entry: "sem-chave.xml",
          kind: "error",
          message: "NF-e sem chave de acesso; a antecipação exige a chave.",
        },
        {
          entry: "denegada.xml",
          kind: "error",
          message: "Protocolo com cStat 302 (não autorizada).",
        },
        { entry: "leia.txt", kind: "discarded", message: "Não é arquivo .xml." },
      ]),
    );
  });

  it("não cria lote quando nenhum item pode ser importado", async () => {
    const { prisma, audit } = dependencies();
    const service = new AnticipationService(prisma as never, audit);

    await expect(service.importBatch(importInput({ "quebrado.xml": "<NFe>" }))).rejects.toEqual(
      new ServiceError(400, "Nenhum item importável no ZIP. quebrado.xml: XML inválido."),
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("recusa cliente de outra organização", async () => {
    const { prisma, audit } = dependencies();
    prisma.client.findFirst.mockResolvedValueOnce(null);
    const service = new AnticipationService(prisma as never, audit);

    await expect(
      service.importBatch(importInput({ "100.xml": nfe(100, ["1.00"]) })),
    ).rejects.toEqual(new ServiceError(404, "Cliente não encontrado."));
  });

  it("transforma corrida de importação na mesma chave em 409, sem gravar parcial", async () => {
    const { prisma, audit } = dependencies();
    prisma.fiscalAnticipationItem.createMany.mockRejectedValueOnce(
      Object.assign(new Error("Unique constraint failed"), { code: "P2002" }),
    );
    const service = new AnticipationService(prisma as never, audit);

    await expect(
      service.importBatch(importInput({ "100.xml": nfe(100, ["1.00"]) })),
    ).rejects.toEqual(
      new ServiceError(
        409,
        "Outra importação gravou as mesmas notas ao mesmo tempo. Recarregue os lotes e tente de novo.",
      ),
    );
  });
});

describe("AnticipationService consultas", () => {
  it("lista e detalha apenas na organização", async () => {
    const { prisma, audit } = dependencies();
    const service = new AnticipationService(prisma as never, audit);

    await service.list({ client_id: clientId, competence: "2026-09" }, organizationId);
    expect(prisma.fiscalAnticipationBatch.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organization_id: organizationId,
          client_id: clientId,
          competence: new Date("2026-09-01T00:00:00.000Z"),
        },
      }),
    );
    await expect(
      service.detail("b0000000-0000-4000-8000-000000000009", organizationId),
    ).rejects.toEqual(new ServiceError(404, "Lote de antecipação não encontrado."));
  });
});
