import * as audit from "./integrations/audit.js";
import { createHttpProjectProgressIntegration } from "./integrations/projectProgress.js";
import prismaClient from "./prisma/index.js";

/**
 * Dependências reais do processo Node, injetadas nos serviços pelas rotas e pelo app.
 * Os serviços não importam estes singletons: o Worker monta os dele por requisição.
 */
export const nodeDeps = {
  prisma: prismaClient,
  audit,
  projectProgress: createHttpProjectProgressIntegration(),
};
