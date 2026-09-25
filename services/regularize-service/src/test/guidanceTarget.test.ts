import { ServiceError } from "@workspace/shared";
import { describe, expect, it, vi } from "vitest";
import { resolveGuidanceTarget } from "../services/guidanceTarget.js";

const organizationId = "10000000-0000-4000-8000-000000000001";
const clientPjId = "10000000-0000-4000-8000-000000000002";
const clientPfId = "10000000-0000-4000-8000-000000000003";

describe("resolveGuidanceTarget", () => {
  it("resolve alvo PJ dentro da organização e cria snapshot cadastral", async () => {
    const findFirst = vi.fn(async () => ({
      id: clientPjId,
      name: "Empresa",
      company_name: "Empresa LTDA",
      fantasy_name: "Empresa",
      cpf_cnpj: "12345678000199",
      address: "Rua A",
      city: "São Paulo",
      state: "SP",
      legal_nature: null,
      share_capital: null,
      regime: null,
    }));

    const result = await resolveGuidanceTarget({ client: { findFirst } }, organizationId, {
      target_type: "PJ",
      client_pj_id: clientPjId,
    });

    expect(result).toMatchObject({
      targetType: "PJ",
      clientPjId,
      clientPfId: null,
      snapshot: { version: 1, source: "client_pj", name: "Empresa" },
    });
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: clientPjId, organization_id: organizationId } }),
    );
  });

  it("resolve alvo PF dentro da organização e cria snapshot cadastral", async () => {
    const findFirst = vi.fn(async () => ({
      id: clientPfId,
      name: "Pessoa Física",
      cpf: "12345678901",
      address: "Rua B",
      city: "Campinas",
      state: "SP",
    }));

    const result = await resolveGuidanceTarget({ clientPF: { findFirst } }, organizationId, {
      target_type: "PF",
      client_pf_id: clientPfId,
    });

    expect(result).toMatchObject({
      targetType: "PF",
      clientPjId: null,
      clientPfId,
      snapshot: { version: 1, source: "client_pf", name: "Pessoa Física", document: "12345678901" },
    });
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: clientPfId, organization_id: organizationId } }),
    );
  });

  it("mantém o snapshot manual para SEM_CLIENTE", async () => {
    await expect(
      resolveGuidanceTarget({}, organizationId, {
        target_type: "SEM_CLIENTE",
        target_snapshot: { version: 1, source: "manual", name: "Interessado" },
      }),
    ).resolves.toEqual({
      targetType: "SEM_CLIENTE",
      clientPjId: null,
      clientPfId: null,
      snapshot: { version: 1, source: "manual", name: "Interessado" },
    });
  });

  it("não revela cadastro ausente ou incompatível com a organização", async () => {
    const findFirst = vi.fn(async () => null);

    await expect(
      resolveGuidanceTarget({ client: { findFirst } }, organizationId, {
        target_type: "PJ",
        client_pj_id: clientPjId,
      }),
    ).rejects.toMatchObject({ statusCode: 404, message: "Cadastro não encontrado." });
    await expect(
      resolveGuidanceTarget({ client: { findFirst } }, organizationId, {
        target_type: "PJ",
        client_pj_id: clientPjId,
        client_pf_id: clientPfId,
      }),
    ).rejects.toEqual(expect.any(ServiceError));
  });

  it("não revela cadastro PF ausente ou de outro tenant", async () => {
    const findFirst = vi.fn(async () => null);

    await expect(
      resolveGuidanceTarget({ clientPF: { findFirst } }, organizationId, {
        target_type: "PF",
        client_pf_id: clientPfId,
      }),
    ).rejects.toMatchObject({ statusCode: 404, message: "Cadastro não encontrado." });
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: clientPfId, organization_id: organizationId } }),
    );
  });
});
