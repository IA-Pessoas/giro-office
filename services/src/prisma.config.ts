import "dotenv/config";
import path from "node:path";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: path.join("..", "..", "infra", "prisma", "schema.prisma"),
  migrations: {
    path: path.join("..", "..", "infra", "prisma", "migrations"),
    seed: "tsx ../../infra/prisma/seed.ts",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
