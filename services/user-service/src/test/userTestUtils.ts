import { Writable } from "node:stream";

import { createLogger } from "@workspace/shared/logger";
import type { NextFunction } from "express";
import { vi } from "vitest";

const { authServiceMock, userServiceMock, permissionServiceMock, storageServiceMock } = vi.hoisted(
  () => ({
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
    },
  }),
);

vi.mock("../services/authService.js", () => ({
  AuthService: vi.fn(function AuthService() {
    return authServiceMock;
  }),
}));

vi.mock("../services/userService.js", () => ({
  UserService: vi.fn(function UserService() {
    return userServiceMock;
  }),
}));

vi.mock("../services/permissionService.js", () => ({
  PermissionService: vi.fn(function PermissionService() {
    return permissionServiceMock;
  }),
}));

vi.mock("../services/storageService.js", () => ({
  StorageService: vi.fn(function StorageService() {
    return storageServiceMock;
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
}));

import { createUserApp } from "../app.js";
import { getUserServiceEnv } from "../config/env.js";

class MemoryLogStream extends Writable {
  _write(
    _chunk: string | Uint8Array,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    callback();
  }
}

export function createTestApp() {
  const env = getUserServiceEnv();
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

export { authServiceMock, permissionServiceMock, storageServiceMock, userServiceMock };
