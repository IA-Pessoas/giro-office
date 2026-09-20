import { defineConfig } from "prisma/config";

// Apenas para gerar DDL a partir do schema, sem carregar a configuração/.env da infra.
export default defineConfig({
  schema: "../../../../infra/prisma/schema.prisma",
  datasource: { url: "postgresql://127.0.0.1:1/unused" },
});
