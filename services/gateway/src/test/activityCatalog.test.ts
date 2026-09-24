import { describe, expect, it } from "vitest";

import { classifyActivity, describeActivity } from "../audit/activityCatalog.js";

describe("activityCatalog", () => {
  it.each([
    ["GET", "/task/list", "consultou", "a lista de tarefas"],
    ["GET", "/reports/catalog", "consultou", "o catálogo de relatórios"],
    [
      "GET",
      "/commercial/proposal-configs",
      "consultou",
      "a lista de configurações de proposta comercial",
    ],
    [
      "POST",
      "/commercial/proposal-configs",
      "cadastrou",
      "uma nova configuração de proposta comercial",
    ],
    ["GET", "/commercial/prospecting", "consultou", "a lista de prospecções comerciais"],
    ["POST", "/commercial/prospecting", "cadastrou", "uma nova prospecção comercial"],
    ["GET", "/pessoal/groups", "consultou", "a lista de grupos de pessoal"],
    ["POST", "/pessoal/groups", "cadastrou", "um novo grupo de pessoal"],
    [
      "DELETE",
      "/pessoal/groups/9a68a809-9a78-4ef9-94d0-b9bb9787ad2e",
      "arquivou",
      "um grupo de pessoal",
    ],
    [
      "POST",
      "/pessoal/groups/9a68a809-9a78-4ef9-94d0-b9bb9787ad2e/reactivate",
      "reativou",
      "um grupo de pessoal",
    ],
    [
      "GET",
      "/pessoal/group-assignments/eligible",
      "consultou",
      "os clientes elegíveis para atribuição de grupo",
    ],
    ["POST", "/pessoal/group-assignments/previews", "gerou", "uma prévia de atribuição de grupo"],
    ["POST", "/pessoal/group-assignments/apply", "aplicou", "uma atribuição de grupo"],
    ["GET", "/triagem/editability", "consultou", "a permissão de edição da triagem"],
    ["GET", "/triagem/competencies", "consultou", "a lista de competências mensais da Triagem"],
    ["POST", "/triagem/competencies", "cadastrou", "uma nova competência mensal da Triagem"],
    [
      "PATCH",
      "/triagem/competencies/competence-1/archive",
      "arquivou",
      "uma competência mensal da Triagem",
    ],
    ["GET", "/triagem/catalogs", "consultou", "os catálogos operacionais da Triagem"],
    ["POST", "/triagem/catalogs", "cadastrou", "um item de catálogo da Triagem"],
    ["PATCH", "/triagem/catalogs/catalog-1", "atualizou", "um item de catálogo da Triagem"],
    ["PATCH", "/triagem/catalogs/catalog-1/archive", "arquivou", "um item de catálogo da Triagem"],
    ["GET", "/triagem/external-links", "consultou", "os links externos da Triagem"],
    ["POST", "/triagem/external-links", "cadastrou", "um link externo da Triagem"],
    ["PUT", "/triagem/external-links/link-1", "atualizou", "um link externo da Triagem"],
    ["PATCH", "/triagem/external-links/link-1/archive", "arquivou", "um link externo da Triagem"],
    ["GET", "/triagem/urgent-requests", "consultou", "as solicitações urgentes da Triagem"],
    ["POST", "/triagem/urgent-requests", "cadastrou", "uma solicitação urgente da Triagem"],
    [
      "PUT",
      "/triagem/urgent-requests/request-1",
      "atualizou",
      "uma solicitação urgente da Triagem",
    ],
    [
      "PATCH",
      "/triagem/urgent-requests/request-1/close",
      "fechou",
      "uma solicitação urgente da Triagem",
    ],
    [
      "PATCH",
      "/triagem/urgent-requests/request-1/reopen",
      "reabriu",
      "uma solicitação urgente da Triagem",
    ],
    ["POST", "/reports/definitions/validate", "revisou", "a configuração de um relatório"],
    ["POST", "/reports/preview", "gerou", "uma prévia de relatório"],
    ["GET", "/reports/jobs/list", "consultou", "o histórico de relatórios"],
    [
      "GET",
      "/reports/jobs/9a68a809-9a78-4ef9-94d0-b9bb9787ad2e",
      "consultou",
      "um job de relatório",
    ],
    ["POST", "/reports/jobs", "gerou", "um relatório"],
    [
      "POST",
      "/reports/jobs/9a68a809-9a78-4ef9-94d0-b9bb9787ad2e/cancel",
      "cancelou",
      "um job de relatório",
    ],
    [
      "GET",
      "/reports/jobs/9a68a809-9a78-4ef9-94d0-b9bb9787ad2e/snapshot",
      "consultou",
      "um snapshot de relatório",
    ],
    [
      "GET",
      "/reports/snapshots/9a68a809-9a78-4ef9-94d0-b9bb9787ad2e/export?format=csv",
      "exportou",
      "um snapshot de relatório",
    ],
    [
      "POST",
      "/reports/snapshots/9a68a809-9a78-4ef9-94d0-b9bb9787ad2e/delete",
      "excluiu",
      "um snapshot de relatório",
    ],
    ["GET", "/reports/retention", "consultou", "a política de retenção de relatórios"],
    ["PUT", "/reports/retention", "alterou", "a política de retenção de relatórios"],
    ["GET", "/reports/models/list", "consultou", "a lista de modelos pessoais de relatório"],
    ["POST", "/reports/models", "cadastrou", "um novo modelo pessoal de relatório"],
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
    ["POST", "/rh/point/recalculate", "recalculou", "os pontos de um colaborador"],
    ["POST", "/rh/point/adjustment/request", "solicitou", "um ajuste de ponto"],
    ["POST", "/rh/point/adjustment/retroactive", "registrou", "uma entrada retroativa de ponto"],
    [
      "POST",
      "/rh/point/adjustment/9a68a809-9a78-4ef9-94d0-b9bb9787ad2e/attachment",
      "anexou",
      "um comprovante de ajuste de ponto",
    ],
    ["PUT", "/rh/point/adjustment/approve-bulk", "aprovou", "um lote de ajustes de ponto"],
    ["PUT", "/rh/timesheets/reopen", "reabriu", "uma folha de ponto assinada"],
    ["PUT", "/rh/timesheets/rebuild", "reconstruiu", "uma folha de ponto aberta"],
    ["GET", "/rh/timesheets/sheet-1/pdf", "baixou", "o PDF de uma folha de ponto"],
    ["GET", "/rh/profile/colaborator", "consultou", "o dossiê de um colaborador"],
    ["GET", "/rh/profile/colaborator/list", "consultou", "a lista de dossiês de colaboradores"],
    ["PUT", "/rh/profile/colaborator", "atualizou", "o dossiê de um colaborador"],
    ["GET", "/rh/profile/contact", "consultou", "os contatos de emergência"],
    ["POST", "/rh/profile/contact", "cadastrou", "um contato de emergência"],
    ["PUT", "/rh/profile/contact", "atualizou", "um contato de emergência"],
    ["DELETE", "/rh/profile/contact", "removeu", "um contato de emergência"],
    ["GET", "/rh/profile/allergy", "consultou", "as alergias de um colaborador"],
    ["PUT", "/rh/profile/allergy", "atualizou", "as alergias de um colaborador"],
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
    ["GET", "/ti/stock", "consultou", "o estoque de TI"],
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
      "PUT",
      "/regularize/guidance/activity",
      "atualizou",
      "uma atividade da orientação de regularização",
    ],
    ["PUT", "/regularize/guidance/partner", "atualizou", "um sócio da orientação de regularização"],
    [
      "POST",
      "/pessoal/obrigations/competences/2026-07/generate",
      "gerou",
      "obrigações da competência",
    ],
    ["GET", "/platform/super-admins", "consultou", "a lista de super admins da plataforma"],
    [
      "POST",
      "/platform/impersonation/exit",
      "encerrou",
      "uma personificação de usuário da organização",
    ],
    [
      "PATCH",
      "/platform/super-admins/platform-user-2/impersonation-permission",
      "alterou",
      "a permissão de personificação de um super admin",
    ],
    ["GET", "/platform/organizations", "consultou", "a lista global de organizações"],
    ["POST", "/platform/organizations", "criou", "uma organização"],
    ["POST", "/platform/organizations/org-1/users", "criou", "um usuário da organização"],
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
    ["GET", "/platform/organizations/org-1/users/user-1", "consultou", "um usuário da organização"],
    [
      "GET",
      "/platform/organizations/org-1/users/user-1/permissions",
      "consultou",
      "as permissões de um usuário da organização",
    ],
    [
      "PATCH",
      "/platform/organizations/org-1/users/user-1",
      "atualizou",
      "um usuário da organização",
    ],
    [
      "PUT",
      "/platform/organizations/org-1/users/user-1/permissions",
      "alterou",
      "as permissões de um usuário da organização",
    ],
    [
      "GET",
      "/platform/organizations/org-1/departments",
      "consultou",
      "os departamentos da organização",
    ],
  ])("traduz %s %s", (method, path, action, item) => {
    expect(describeActivity(method, path)).toEqual({ action, item });
  });

  it("classifica POST /task/project-wizard como criação visível de Projeto com Tarefas", () => {
    expect(classifyActivity("POST", "/task/project-wizard")).toEqual({
      kind: "visible",
      description: { action: "criou", item: "um projeto com tarefas" },
    });
  });

  it("classifica a extração de tarefas por IA como atividade visível sem expor a Ata", () => {
    expect(classifyActivity("POST", "/task/project-wizard/extract-tasks")).toEqual({
      kind: "visible",
      description: { action: "extraiu", item: "tarefas de uma Ata com IA" },
    });
  });

  it("classifica a prévia do wizard como atividade visível", () => {
    expect(classifyActivity("POST", "/task/project-wizard/preview")).toEqual({
      kind: "visible",
      description: { action: "gerou", item: "uma prévia de projeto com tarefas" },
    });
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
    ["GET", "/triagem/overview"],
    ["GET", "/triagem/competencies/competence-1/history"],
  ])("classifica %s %s como técnico", (method, path) => {
    expect(classifyActivity(method, path)).toEqual({ kind: "technical" });
    expect(describeActivity(method, path)).toBeNull();
  });

  it("não inventa descrição para rota desconhecida", () => {
    expect(classifyActivity("POST", "/unknown/action")).toEqual({ kind: "unknown" });
    expect(classifyActivity("POST", "/task/nova-acao")).toEqual({ kind: "unknown" });
    expect(classifyActivity("POST", "/pessoal/groups/42/unknown")).toEqual({ kind: "unknown" });
    expect(classifyActivity("GET", "/pessoal/group-assignments/unknown")).toEqual({
      kind: "unknown",
    });
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
