import {
  CSRF_HEADER_NAME,
  FORWARDED_AUTH_USER_ID_HEADER,
  INTERNAL_SERVICE_TOKEN_HEADER,
} from "@workspace/shared";
import { describe, expect, it } from "vitest";

import { buildWebSocketHeaders } from "./wsProxy.js";

describe("buildWebSocketHeaders", () => {
  it("não encaminha credenciais do navegador nem identidade interna", () => {
    expect(
      buildWebSocketHeaders({
        authorization: "Bearer browser-token",
        cookie: "cw.session=signed; cw.csrf=proof; theme=dark",
        [CSRF_HEADER_NAME]: "proof",
        [INTERNAL_SERVICE_TOKEN_HEADER]: "attacker-token",
        [FORWARDED_AUTH_USER_ID_HEADER]: "attacker-user",
        upgrade: "websocket",
        connection: "Upgrade",
      }),
    ).toEqual({
      upgrade: "websocket",
      connection: "Upgrade",
    });
  });
});
