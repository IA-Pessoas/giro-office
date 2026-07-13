export const operations = [
  {
    service: "parcelamento-service",
    method: "GET",
    path: "/health",
    action: "parcelamentoServiceHealth",
    target: "direct",
    auth: "public",
  },
  {
    service: "parcelamento-service",
    method: "GET",
    path: "/ready",
    action: "parcelamentoServiceReady",
    target: "direct",
    auth: "public",
  },
];
