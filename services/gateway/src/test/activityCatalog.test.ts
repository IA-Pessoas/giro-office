import { describe, expect, it } from "vitest";

import { classifyActivity, describeActivity } from "../audit/activityCatalog.js";

describe("activityCatalog", () => {
  it.each([
    ["GET", "/task/list", "consultou", "a lista de tarefas"],
    ["GET", "/reports/catalog", "consultou", "o catálogo de relatórios"],
    ["POST", "/reports/preview", "gerou", "uma prévia de relatório"],
    ["GET", "/reports/models/list", "consultou", "a lista de modelos pessoais de relatório"],
    ["POST", "/reports/models", "cadastrou", "um novo modelo pessoal de relatório"],
    ["POST", "/reports/jobs", "solicitou", "uma execução de relatório"],
    ["GET", "/reports/jobs/42", "consultou", "uma execução de relatório"],
    ["POST", "/reports/jobs/42/cancel", "solicitou", "o cancelamento de uma execução de relatório"],
    ["GET", "/reports/jobs/42/snapshot", "consultou", "o resultado de uma execução de relatório"],
    ["POST", "/reports/models/shared", "cadastrou", "um novo modelo compartilhado de relatório"],
    [
      "GET",
      "/reports/models/shared/list",
      "consultou",
      "a lista de modelos compartilhados de relatório",
    ],
    ["PATCH", "/reports/models/shared/42", "atualizou", "um modelo compartilhado de relatório"],
    ["POST", "/reports/models/shared/42/copy", "copiou", "um modelo compartilhado de relatório"],
    [
      "POST",
      "/reports/models/shared/42/preview",
      "gerou",
      "uma prévia de modelo compartilhado de relatório",
    ],
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
    ["PUT", "/rh/point/adjustment/reject", "rejeitou", "um ajuste de ponto"],
    ["GET", "/parcelamento/installments", "consultou", "a lista de parcelamentos"],
    ["POST", "/parcelamento/installments", "cadastrou", "um novo parcelamento"],
    [
      "GET",
      "/parcelamento/installments/9a68a809-9a78-4ef9-94d0-b9bb9787ad2e",
      "consultou",
      "um parcelamento",
    ],
    [
      "PATCH",
      "/parcelamento/installments/9a68a809-9a78-4ef9-94d0-b9bb9787ad2e",
      "atualizou",
      "um parcelamento",
    ],
    [
      "GET",
      "/parcelamento/installments/9a68a809-9a78-4ef9-94d0-b9bb9787ad2e/competencies",
      "consultou",
      "as competências de um parcelamento",
    ],
    [
      "POST",
      "/parcelamento/installments/9a68a809-9a78-4ef9-94d0-b9bb9787ad2e/competencies",
      "cadastrou",
      "uma nova competência de um parcelamento",
    ],
    [
      "PATCH",
      "/parcelamento/installment-competencies/9a68a809-9a78-4ef9-94d0-b9bb9787ad2e",
      "atualizou",
      "uma competência de parcelamento",
    ],
    ["GET", "/parcelamento/panoramas", "consultou", "a lista de panoramas de parcelamento"],
    ["POST", "/parcelamento/panoramas", "cadastrou", "um novo panorama de parcelamento"],
    [
      "GET",
      "/parcelamento/panoramas/9a68a809-9a78-4ef9-94d0-b9bb9787ad2e",
      "consultou",
      "um panorama de parcelamento",
    ],
    [
      "PATCH",
      "/parcelamento/panoramas/9a68a809-9a78-4ef9-94d0-b9bb9787ad2e",
      "atualizou",
      "um panorama de parcelamento",
    ],
    [
      "POST",
      "/parcelamento/panoramas/competences/2026-07/generate",
      "gerou",
      "panoramas de parcelamento",
    ],
    [
      "PATCH",
      "/ti/requests/9a68a809-9a78-4ef9-94d0-b9bb9787ad2e/status",
      "alterou",
      "o status de uma solicitação de TI",
    ],
    [
      "GET",
      "/ti/requests/9a68a809-9a78-4ef9-94d0-b9bb9787ad2e/transfer-candidates",
      "consultou",
      "os candidatos de transferência de uma solicitação de TI",
    ],
    [
      "POST",
      "/ti/passwords/9a68a809-9a78-4ef9-94d0-b9bb9787ad2e/deactivate",
      "inativou",
      "uma credencial de TI",
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
    ["GET", "/platform/organizations", "consultou", "a lista global de organizações"],
    ["POST", "/platform/organizations", "criou", "uma organização"],
    ["GET", "/platform/organizations/org-1", "consultou", "uma organização"],
    ["PATCH", "/platform/organizations/org-1/status", "alterou", "o status de uma organização"],
    [
      "PATCH",
      "/platform/organizations/org-1/subscription-plan",
      "alterou",
      "o plano de uma organização",
    ],
    ["PATCH", "/platform/organizations/org-1/logo-url", "atualizou", "a marca de uma organização"],
    [
      "GET",
      "/platform/organizations/org-1/users",
      "consultou",
      "a lista global de usuários da organização",
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
    ["POST", "/platform/session"],
    ["DELETE", "/platform/session"],
    ["POST", "/platform/session/refresh"],
    ["GET", "/platform/me"],
    ["GET", "/platform/audit/requests"],
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

  it("classifica inativação de credencial de TI sem expor identificadores ou motivo", () => {
    const serialized = JSON.stringify(
      describeActivity(
        "POST",
        "/ti/passwords/9a68a809-9a78-4ef9-94d0-b9bb9787ad2e/deactivate?reason=secret",
      ),
    );

    expect(serialized).toContain("inativou");
    expect(serialized).not.toContain("9a68a809");
    expect(serialized).not.toContain("reason");
    expect(serialized).not.toContain("secret");
  });

  it.each([
    ["", "/task/list"],
    ["TRACE", "/task/list"],
    ["GET", "not a path"],
  ])("trata método ou path inválido sem lançar", (method, path) => {
    expect(classifyActivity(method, path)).toEqual({ kind: "unknown" });
  });
});
