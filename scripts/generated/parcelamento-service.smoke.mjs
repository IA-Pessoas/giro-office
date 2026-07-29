// Generated smoke coverage for parcelamento-service OpenAPI operations.
// Non-health probes are gated until fixture-backed runtime handlers are enabled.

export const service = "parcelamento-service";
const parcelamentoSmokeCondition = "parcelamentoSmokeEnabled";

const healthOperations = [
  {
    service,
    method: "GET",
    path: "/health",
    action: "parcelamentoServiceHealth",
    target: "direct",
    auth: "public",
  },
  {
    service,
    method: "GET",
    path: "/ready",
    action: "parcelamentoServiceReady",
    target: "direct",
    auth: "public",
  },
];

const parcelamentoOpenApiOperations = [
  {
    service,
    method: "GET",
    path: "/parcelamento/installments",
    action: "parcelamentoInstallmentsList",
    target: "gateway",
    auth: "bearer",
    expectedStatus: [200],
  },
  {
    service,
    method: "POST",
    path: "/parcelamento/installments",
    action: "parcelamentoInstallmentCreate",
    target: "gateway",
    auth: "bearer",
    expectedStatus: [201],
  },
  {
    service,
    method: "GET",
    path: "/parcelamento/installments/{id}",
    action: "parcelamentoInstallmentDetail",
    target: "gateway",
    auth: "bearer",
    expectedStatus: [200],
  },
  {
    service,
    method: "PATCH",
    path: "/parcelamento/installments/{id}",
    action: "parcelamentoInstallmentPatch",
    target: "gateway",
    auth: "bearer",
    expectedStatus: [200],
  },
  {
    service,
    method: "GET",
    path: "/parcelamento/installments/{installmentId}/competencies",
    action: "parcelamentoInstallmentCompetenciesList",
    target: "gateway",
    auth: "bearer",
    expectedStatus: [200],
  },
  {
    service,
    method: "POST",
    path: "/parcelamento/installments/{installmentId}/competencies",
    action: "parcelamentoInstallmentCompetencyCreate",
    target: "gateway",
    auth: "bearer",
    expectedStatus: [201],
  },
  {
    service,
    method: "PATCH",
    path: "/parcelamento/installment-competencies/{id}",
    action: "parcelamentoInstallmentCompetencyPatch",
    target: "gateway",
    auth: "bearer",
    expectedStatus: [200],
  },
  {
    service,
    method: "GET",
    path: "/parcelamento/panoramas",
    action: "parcelamentoPanoramasList",
    target: "gateway",
    auth: "bearer",
    expectedStatus: [200],
  },
  {
    service,
    method: "POST",
    path: "/parcelamento/panoramas",
    action: "parcelamentoPanoramaCreate",
    target: "gateway",
    auth: "bearer",
    expectedStatus: [201],
  },
  {
    service,
    method: "GET",
    path: "/parcelamento/panoramas/{id}",
    action: "parcelamentoPanoramaDetail",
    target: "gateway",
    auth: "bearer",
    expectedStatus: [200],
  },
  {
    service,
    method: "PATCH",
    path: "/parcelamento/panoramas/{id}",
    action: "parcelamentoPanoramaPatch",
    target: "gateway",
    auth: "bearer",
    expectedStatus: [200],
  },
  {
    service,
    method: "POST",
    path: "/parcelamento/panoramas/competences/{competence}/generate",
    action: "parcelamentoPanoramasGenerate",
    target: "gateway",
    auth: "bearer",
    expectedStatus: [200],
  },
];

export const operations = [
  ...healthOperations,
  ...parcelamentoOpenApiOperations.map((operation) => ({
    condition: parcelamentoSmokeCondition,
    ...operation,
  })),
];
