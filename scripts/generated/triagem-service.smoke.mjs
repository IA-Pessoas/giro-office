// Fixture-backed smoke operations for triagem-service.

export const service = "triagem-service";

export const operations = [
  {
    service: "triagem-service",
    method: "GET",
    path: "/health",
    action: "serviceHealth",
    target: "direct",
    auth: "public",
  },
  {
    service: "triagem-service",
    method: "GET",
    path: "/ready",
    action: "serviceReady",
    target: "direct",
    auth: "public",
  },
  {
    service: "triagem-service",
    method: "GET",
    path: "/triagem/competencies",
    action: "triagemCompetenceList",
    target: "gateway",
    auth: "bearer",
  },
  {
    service: "triagem-service",
    method: "POST",
    path: "/triagem/competencies",
    action: "triagemCompetenceCreate",
    target: "gateway",
    auth: "bearer",
  },
  {
    service: "triagem-service",
    method: "PATCH",
    path: "/triagem/competencies/{id}/archive",
    action: "triagemCompetenceArchive",
    target: "gateway",
    auth: "bearer",
  },
];

export const routePlaceholders = [];
