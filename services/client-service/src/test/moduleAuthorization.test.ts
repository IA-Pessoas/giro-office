import { ServiceError } from "@workspace/shared";
import type { Request } from "express";
import { describe, expect, it } from "vitest";
import {
  requireClientDomainAccess,
  requireClientDomainModule,
} from "../utils/moduleAuthorization.js";

function requestWithModules(modules: Record<string, number>): Request {
  return { modules, user_type: "user" } as unknown as Request;
}

describe("requireClientDomainModule", () => {
  it("não permite que Integração alcance mutações verticais", () => {
    expect(() =>
      requireClientDomainModule(requestWithModules({ integracao: 3 }), "financeiro"),
    ).toThrowError(ServiceError);
  });

  it("mantém o acesso do módulo vertical correspondente", () => {
    expect(() =>
      requireClientDomainModule(requestWithModules({ financeiro: 1 }), "financeiro"),
    ).not.toThrow();
  });

  it("nega contexto modular ausente para chamadas diretas", () => {
    expect(() => requireClientDomainAccess({ user_type: "user" } as unknown as Request)).toThrow(
      ServiceError,
    );
  });

  it("não concede ações de domínio a Integração", () => {
    expect(() => requireClientDomainAccess(requestWithModules({ integracao: 3 }))).toThrow(
      ServiceError,
    );
  });
});
