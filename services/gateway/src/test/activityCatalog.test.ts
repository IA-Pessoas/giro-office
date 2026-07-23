import { describe, expect, it } from "vitest";

import { classifyActivity, describeActivity } from "../audit/activityCatalog.js";

describe("activityCatalog", () => {
  it.each([
    ["GET", "/task/list", "consultou", "a lista de tarefas"],
    ["POST", "/user", "cadastrou", "um novo usuário"],
    [
      "PATCH",
      "/organizations/9a68a809-9a78-4ef9-94d0-b9bb9787ad2e",
      "atualizou",
      "uma organização",
    ],
    ["DELETE", "/department/42", "excluiu", "um departamento"],
    ["GET", "/client/list?page=2&search=segredo", "consultou", "a lista de clientes"],
    ["POST", "/rh/point/register", "registrou", "um ponto"],
    ["POST", "/rh/point/register/", "registrou", "um ponto"],
    ["POST", "/project/progress", "recalculou", "o progresso de um projeto"],
    [
      "POST",
      "/certificate/pj/9a68a809-9a78-4ef9-94d0-b9bb9787ad2e/file",
      "enviou",
      "o arquivo de um certificado de pessoa jurídica",
    ],
    [
      "GET",
      "/certificate/pj/9a68a809-9a78-4ef9-94d0-b9bb9787ad2e/file",
      "baixou",
      "o arquivo de um certificado de pessoa jurídica",
    ],
    [
      "DELETE",
      "/certificate/pj/9a68a809-9a78-4ef9-94d0-b9bb9787ad2e/file",
      "removeu",
      "o arquivo de um certificado de pessoa jurídica",
    ],
    [
      "POST",
      "/certificate/pf/9a68a809-9a78-4ef9-94d0-b9bb9787ad2e/file",
      "enviou",
      "o arquivo de um certificado de pessoa física",
    ],
    [
      "GET",
      "/certificate/pf/9a68a809-9a78-4ef9-94d0-b9bb9787ad2e/file",
      "baixou",
      "o arquivo de um certificado de pessoa física",
    ],
    [
      "DELETE",
      "/certificate/pf/9a68a809-9a78-4ef9-94d0-b9bb9787ad2e/file",
      "removeu",
      "o arquivo de um certificado de pessoa física",
    ],
    ["POST", "/rh/point/adjustment/approve", "aprovou", "um ajuste de ponto"],
    [
      "PATCH",
      "/ti/requests/9a68a809-9a78-4ef9-94d0-b9bb9787ad2e/status",
      "alterou",
      "o status de uma solicitação de TI",
    ],
    ["POST", "/ti/terms/9a68a809-9a78-4ef9-94d0-b9bb9787ad2e/sign", "assinou", "um termo de TI"],
    [
      "POST",
      "/regularize/guidance/activity/add",
      "adicionou",
      "uma atividade à orientação de regularização",
    ],
    [
      "POST",
      "/pessoal/obrigations/competences/2026-07/generate",
      "gerou",
      "obrigações da competência",
    ],
  ])("traduz %s %s", (method, path, action, item) => {
    expect(describeActivity(method, path)).toEqual({ action, item });
  });

  it.each([
    ["GET", "/health"],
    ["GET", "/ready"],
    ["GET", "/openapi.json"],
    ["GET", "/project/metrics"],
    ["GET", "/dashboard/stats"],
    ["GET", "/audit/requests"],
    ["POST", "/user/session"],
    ["GET", "/user/me"],
  ])("classifica %s %s como técnico", (method, path) => {
    expect(classifyActivity(method, path)).toEqual({ kind: "technical" });
    expect(describeActivity(method, path)).toBeNull();
  });

  it("não inventa descrição para rota desconhecida", () => {
    expect(classifyActivity("POST", "/unknown/action")).toEqual({ kind: "unknown" });
    expect(classifyActivity("POST", "/task/nova-acao")).toEqual({ kind: "unknown" });
    expect(describeActivity("POST", "/unknown/action")).toBeNull();
  });

  it("não devolve identificadores nem query string", () => {
    const serialized = JSON.stringify(
      describeActivity("GET", "/client/9a68a809-9a78-4ef9-94d0-b9bb9787ad2e?token=nao-exibir"),
    );

    expect(serialized).not.toContain("9a68a809");
    expect(serialized).not.toContain("token");
    expect(serialized).not.toContain("nao-exibir");
  });

  it.each([
    ["", "/task/list"],
    ["TRACE", "/task/list"],
    ["GET", "not a path"],
  ])("trata método ou path inválido sem lançar", (method, path) => {
    expect(classifyActivity(method, path)).toEqual({ kind: "unknown" });
  });
});
