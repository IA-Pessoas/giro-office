import type { Express, Request, Response } from "express";
import swaggerUi from "swagger-ui-express";

/** OpenAPI 3.x document (estrutura validada em runtime pelo Swagger UI). */
export type OpenApiDocument = Record<string, unknown> & {
  openapi: string;
  info: { title: string; version: string; description?: string };
  paths: Record<string, unknown>;
};

export interface MountOpenApiDocsOptions {
  spec: OpenApiDocument;
  docsPath?: string;
  jsonPath?: string;
  specUrl?: string;
  siteTitle?: string;
}

/**
 * Registra `GET <jsonPath>` com o JSON do spec e `GET <docsPath>` com Swagger UI.
 */
export function mountOpenApiDocs(app: Express, options: MountOpenApiDocsOptions): void {
  const {
    spec,
    docsPath = "/docs",
    jsonPath = "/openapi.json",
    specUrl = jsonPath,
    siteTitle = "API Docs",
  } = options;

  app.get(jsonPath, (_req: Request, res: Response) => {
    res.json(spec);
  });

  app.use(
    docsPath,
    swaggerUi.serve,
    swaggerUi.setup(undefined, {
      customSiteTitle: siteTitle,
      swaggerOptions: { url: specUrl },
    }),
  );
}
