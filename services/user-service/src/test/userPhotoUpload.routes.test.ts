import {
  FORWARDED_AUTH_ORGANIZATION_ID_HEADER,
  FORWARDED_AUTH_PERMISSION_HEADER,
  FORWARDED_AUTH_USER_ID_HEADER,
  INTERNAL_SERVICE_TOKEN_HEADER,
} from "@workspace/shared";
import { createLogger } from "@workspace/shared/logger";
import { MemoryLogStream } from "@workspace/shared/testUtils";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { createUserApp } from "../app.js";
import { getUserServiceEnv } from "../config/env.js";

const authHeaders = {
  [INTERNAL_SERVICE_TOKEN_HEADER]: "audit-service-token",
  [FORWARDED_AUTH_USER_ID_HEADER]: "c0000000-0000-4000-8000-000000000001",
  [FORWARDED_AUTH_ORGANIZATION_ID_HEADER]: "a0000000-0000-4000-8000-000000000001",
  [FORWARDED_AUTH_PERMISSION_HEADER]: "2",
};

function createUploadTestApp() {
  return createUserApp(
    getUserServiceEnv(),
    createLogger({
      service: "user-service-upload-test",
      env: "test",
      level: "silent",
      destination: new MemoryLogStream(),
    }),
  );
}

describe("user photo upload routes", () => {
  it("POST /user/:id/photo retorna 413 para imagem acima do limite", async () => {
    const app = createUploadTestApp();
    const oversizedPng = Buffer.alloc(5 * 1024 * 1024 + 1);

    const res = await request(app)
      .post("/user/user-3/photo")
      .set(authHeaders)
      .attach("file", oversizedPng, {
        filename: "avatar.png",
        contentType: "image/png",
      });

    expect(res.status).toBe(413);
    expect(res.body).toMatchObject({
      success: false,
      error: "A imagem deve ter no máximo 5 MB.",
      code: "PAYLOAD_TOO_LARGE",
    });
  });
});
