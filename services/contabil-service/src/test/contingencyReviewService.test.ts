import { parseWithZod } from "@workspace/shared";
import { describe, expect, it, vi } from "vitest";
import { contingencyQuerySchema } from "../schemas/contingency.schemas.js";
import { ContingencyService } from "../services/contingencyService.js";
import { contingencyRows, contingencyXls } from "./contingencyFixtures.js";
import { contingencyDatabase } from "./contingencyReviewFixtures.js";

const auth = { userId: "reviewer", organizationId: "organization-a", permission: 2 };
const input = parseWithZod(contingencyQuerySchema, {
  client_id: "b0000000-0000-4000-8000-000000000001",
  company_name: "Empresa Sintética",
  cnpj: "11222333000181",
  period_start: "2026-01",
  period_end: "2026-06",
  regime: "Simples Nacional",
  annex: "III",
  filename: "balancete.xls",
});

describe("Revisão da Contingência", () => {
  it("mostra o cálculo antes da revisão e só exporta após registrar ator, instante e hash", async () => {
    const service = new ContingencyService(contingencyDatabase().prisma);
    const result = await service.simulate(contingencyXls(), input, auth);
    expect(result.minimum.totalCents).toBe(398200);
    await expect(service.export(result.id, result.content_hash, auth)).rejects.toMatchObject({
      statusCode: 409,
    });
    const before = Date.now();
    const review = await service.review(result.id, result.content_hash, auth);
    expect(review.reviewed_by).toBe("reviewer");
    expect(review.reviewed_hash).toBe(result.content_hash);
    expect(new Date(review.reviewed_at).getTime()).toBeGreaterThanOrEqual(before);
    const html = await service.export(result.id, result.content_hash, auth);
    expect(html).toContain("Simulação legada de Contingência");
    expect(html).toContain("Empresa Sintética");
    expect(html).toContain("3.982,00");
    expect(html).toContain("Hipóteses");
    expect(html).toContain(result.content_hash);
    expect(html).toContain("reviewer");
  });

  it("invalida a revisão ao recalcular e recusa confirmações e exportações desatualizadas", async () => {
    const service = new ContingencyService(contingencyDatabase().prisma);
    const first = await service.simulate(contingencyXls(), input, auth);
    await service.review(first.id, first.content_hash, auth);
    const changed = await service.simulate(
      contingencyXls(),
      { ...input, simulation_id: first.id, rate: 12 },
      auth,
    );
    expect(changed.id).toBe(first.id);
    expect(changed.content_hash).not.toBe(first.content_hash);
    expect(changed.minimum.totalCents).toBe(434400);
    await expect(service.review(first.id, first.content_hash, auth)).rejects.toMatchObject({
      statusCode: 409,
    });
    await expect(service.export(first.id, first.content_hash, auth)).rejects.toMatchObject({
      statusCode: 409,
    });
    await expect(service.export(changed.id, changed.content_hash, auth)).rejects.toMatchObject({
      statusCode: 409,
    });
    await service.review(changed.id, changed.content_hash, auth);
    expect(await service.export(changed.id, changed.content_hash, auth)).toContain("4.344,00");
  });

  it("invalida por mudança de arquivo ou de qualquer parâmetro, mesmo ao retornar ao conteúdo anterior", async () => {
    const service = new ContingencyService(contingencyDatabase().prisma);
    const rows = contingencyRows();
    rows[3][20] = 130000;
    let current = await service.simulate(contingencyXls(), input, auth);
    for (const change of [
      { period_start: "2026-02" },
      { period_end: "2026-08" },
      { annex: "IV" as const },
      { regime: "Lucro Presumido" as const, annex: "" as const },
      { filename: "novo.xls" },
      {},
    ]) {
      await service.review(current.id, current.content_hash, auth);
      const next = await service.simulate(
        contingencyXls(rows),
        { ...input, ...change, simulation_id: current.id },
        auth,
      );
      expect(next.content_hash).not.toBe(current.content_hash);
      await expect(service.export(next.id, next.content_hash, auth)).rejects.toMatchObject({
        statusCode: 409,
      });
      current = next;
    }
  });

  it("não confirma uma revisão que ficou desatualizada durante a gravação", async () => {
    const { prisma, drafts } = contingencyDatabase();
    const service = new ContingencyService(prisma);
    const first = await service.simulate(contingencyXls(), input, auth);
    const update = drafts.updateMany.bind(drafts);
    vi.spyOn(drafts, "updateMany").mockImplementationOnce(async (args) => {
      await service.simulate(
        contingencyXls(),
        { ...input, simulation_id: first.id, rate: 12 },
        auth,
      );
      return update(args);
    });
    await expect(service.review(first.id, first.content_hash, auth)).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it("revalida acesso e identidade do cliente e escapa texto do relatório", async () => {
    const { prisma, client } = contingencyDatabase();
    client.name = '<img src=x onerror="alert(1)">';
    const service = new ContingencyService(prisma);
    const current = await service.simulate(
      contingencyXls(),
      { ...input, company_name: client.name },
      auth,
    );
    await service.review(current.id, current.content_hash, auth);
    const html = await service.export(current.id, current.content_hash, auth);
    expect(html).toContain("&lt;img");
    expect(html).not.toContain("<img");
    for (const operation of [service.review.bind(service), service.export.bind(service)]) {
      await expect(
        operation(current.id, current.content_hash, { ...auth, permission: 1 }),
      ).rejects.toMatchObject({ statusCode: 403 });
      await expect(
        operation(current.id, current.content_hash, { ...auth, organizationId: "other" }),
      ).rejects.toMatchObject({ statusCode: 404 });
    }
    await expect(
      service.simulate(
        contingencyXls(),
        { ...input, simulation_id: current.id },
        { ...auth, organizationId: "other" },
      ),
    ).rejects.toMatchObject({ statusCode: 404 });
    client.name = "Nome alterado";
    await expect(service.export(current.id, current.content_hash, auth)).rejects.toMatchObject({
      statusCode: 409,
    });
  });
});
