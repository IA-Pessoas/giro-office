import {
  FORWARDED_AUTH_ORGANIZATION_ID_HEADER,
  FORWARDED_AUTH_PERMISSION_HEADER,
  FORWARDED_AUTH_USER_ID_HEADER,
  INTERNAL_SERVICE_TOKEN_HEADER,
} from "@workspace/shared";
import { createLogger } from "@workspace/shared/logger";
import { MemoryLogStream } from "@workspace/shared/testUtils";
import type { NextFunction } from "express";
import { type Mock, vi } from "vitest";

interface UserRouteMocks {
  authServiceMock: {
    login: Mock;
    firstCreate: Mock;
  };
  userServiceMock: {
    list: Mock;
    getById: Mock;
    create: Mock;
    update: Mock;
    delete: Mock;
  };
  permissionServiceMock: {
    getByUserId: Mock;
    update: Mock;
  };
  storageServiceMock: {
    uploadUserPhoto: Mock;
    deleteUserPhoto: Mock;
    readUserPhoto: Mock;
  };
}

const userRouteMocks: UserRouteMocks = vi.hoisted(
  (): UserRouteMocks => ({
    authServiceMock: {
      login: vi.fn(),
      firstCreate: vi.fn(),
    },
    userServiceMock: {
      list: vi.fn(),
      getById: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    permissionServiceMock: {
      getByUserId: vi.fn(),
      update: vi.fn(),
    },
    storageServiceMock: {
      uploadUserPhoto: vi.fn(),
      deleteUserPhoto: vi.fn(),
      readUserPhoto: vi.fn(),
    },
  }),
);

vi.mock("../services/authService.js", () => ({
  AuthService: vi.fn(function AuthService() {
    return userRouteMocks.authServiceMock;
  }),
}));

vi.mock("../services/userService.js", () => ({
  UserService: vi.fn(function UserService() {
    return userRouteMocks.userServiceMock;
  }),
}));

vi.mock("../services/permissionService.js", () => ({
  PermissionService: vi.fn(function PermissionService() {
    return userRouteMocks.permissionServiceMock;
  }),
}));

vi.mock("../services/storageService.js", () => ({
  StorageService: vi.fn(function StorageService() {
    return userRouteMocks.storageServiceMock;
  }),
}));

vi.mock("@workspace/shared/upload", () => ({
  createPhotoUploadMiddleware: () => ({
    single: () => (req: Express.Request, _res: Express.Response, next: NextFunction) => {
      req.file = {
        fieldname: "file",
        originalname: "avatar.png",
        encoding: "7bit",
        mimetype: "image/png",
        size: 4,
        buffer: Buffer.from("test"),
      } as Express.Multer.File;
      next();
    },
  }),
  validateUploadFileSignature: vi.fn(),
}));

import { createUserApp } from "../app.js";
import type { UserServiceEnv } from "../config/env.js";
import { getUserServiceEnv } from "../config/env.js";

const DEFAULT_TEST_ORGANIZATION_ID = "a0000000-0000-4000-8000-000000000001";
const DEFAULT_TEST_USER_ID = "c0000000-0000-4000-8000-000000000001";

/** Headers como o gateway envia após JWT válido (alinhado ao department-service). */
export function gatewayAuthHeaders(overrides?: {
  userId?: string;
  organizationId?: string;
  permission?: number;
}): Record<string, string> {
  return {
    [INTERNAL_SERVICE_TOKEN_HEADER]: "audit-service-token",
    [FORWARDED_AUTH_USER_ID_HEADER]: overrides?.userId ?? DEFAULT_TEST_USER_ID,
    [FORWARDED_AUTH_ORGANIZATION_ID_HEADER]:
      overrides?.organizationId ?? DEFAULT_TEST_ORGANIZATION_ID,
    [FORWARDED_AUTH_PERMISSION_HEADER]: String(overrides?.permission ?? 2),
  };
}

export function createTestApp(overrides: Partial<UserServiceEnv> = {}) {
  const env = { ...getUserServiceEnv(), ...overrides };
  const logger = createLogger({
    service: "user-service-test",
    env: "test",
    level: "silent",
    destination: new MemoryLogStream(),
  });

  return createUserApp(env, logger);
}

export function resetUserRouteMocks() {
  vi.clearAllMocks();
}

const authServiceMock: UserRouteMocks["authServiceMock"] = userRouteMocks.authServiceMock;
const userServiceMock: UserRouteMocks["userServiceMock"] = userRouteMocks.userServiceMock;
const permissionServiceMock: UserRouteMocks["permissionServiceMock"] =
  userRouteMocks.permissionServiceMock;
const storageServiceMock: UserRouteMocks["storageServiceMock"] = userRouteMocks.storageServiceMock;

export { authServiceMock, permissionServiceMock, storageServiceMock, userServiceMock };
