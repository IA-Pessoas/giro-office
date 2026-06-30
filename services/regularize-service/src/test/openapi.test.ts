import { describe, expect, it } from "vitest";

import { buildRegularizeServiceOpenApiSpec } from "../openapi/spec.js";

describe("regularize OpenAPI spec", () => {
  it("documents credential list responses without clear secrets", () => {
    const spec = buildRegularizeServiceOpenApiSpec({ port: 3039 });
    const components = spec.components as {
      schemas: Record<string, { properties?: Record<string, unknown> }>;
    };

    expect(components.schemas.ErrorEnvelope).toBeTruthy();
    expect(components.schemas.Uuid).toBeTruthy();
    expect(components.schemas.PasswordListItem.properties).not.toHaveProperty("login");
    expect(components.schemas.PasswordListItem.properties).not.toHaveProperty("password");
    expect(components.schemas.SitePasswordListItem.properties).not.toHaveProperty("password");

    const paths = spec.paths as Record<
      string,
      Record<string, { responses?: Record<string, unknown> }>
    >;
    const sensitiveOperations = [
      paths["/regularize/passwords"]?.get,
      paths["/regularize/passwords"]?.post,
      paths["/regularize/passwords"]?.put,
      paths["/regularize/password"]?.get,
      paths["/regularize/sites-pass"]?.get,
      paths["/regularize/sites-pass"]?.post,
      paths["/regularize/sites-pass"]?.put,
      paths["/regularize/sites-pass-detail"]?.get,
    ];

    for (const operation of sensitiveOperations) {
      expect(operation?.responses).toHaveProperty("400");
      expect(operation?.responses).toHaveProperty("401");
      expect(operation?.responses).toHaveProperty("403");
      expect(operation?.responses).toHaveProperty("404");
      expect(operation?.responses).toHaveProperty("409");
    }
  });
});
