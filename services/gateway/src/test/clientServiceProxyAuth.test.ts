import { describe, expect, it } from "vitest";

import type { GatewayEnv } from "../config/env.js";
import { getGatewayServiceDefinitions } from "../config/serviceRegistry.js";

describe("client-service gateway boundary", () => {
  it("encaminha o token interno configurado ao client-service", () => {
    const definitions = getGatewayServiceDefinitions({
      clientServiceUrl: "http://127.0.0.1:3035",
      clientServiceInternalToken: "client-service-token",
    } as never as GatewayEnv);

    const clientService = definitions.find((service) => service.key === "client-service");

    expect(clientService?.internalServiceToken).toBe("client-service-token");
  });
});
