import { getTaskServiceEnv } from "../config/env.js";
import {
  type CreateHttpProjectProgressIntegrationOptions,
  HttpProjectProgressIntegration,
  type ProjectProgressIntegration,
} from "./projectProgressHttp.js";

export type {
  ProjectProgressIntegration,
  RecalculateProjectProgressParams,
} from "./projectProgressHttp.js";

export function createHttpProjectProgressIntegration(
  options?: Partial<CreateHttpProjectProgressIntegrationOptions>,
): ProjectProgressIntegration {
  const env = getTaskServiceEnv();

  return new HttpProjectProgressIntegration({
    serviceUrl: options?.serviceUrl ?? env.projectServiceUrl,
    serviceToken: options?.serviceToken ?? env.auditServiceToken,
    fetchImpl: options?.fetchImpl,
  });
}
