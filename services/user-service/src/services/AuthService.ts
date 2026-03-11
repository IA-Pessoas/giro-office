import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

import { ServiceError } from "@workspace/shared";

import { getUserServiceEnv } from "../config/env.js";
import prismaClient from "../prisma/index.js";

interface LoginRequest {
  login: string;
  password: string;
}

class AuthService {
  async login({ login, password }: LoginRequest) {
    const user = await prismaClient.user.findFirst({
      where: { login },
    });

    if (!user) {
      throw new ServiceError(401, "Login/Senha Incorreto!");
    }

    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      throw new ServiceError(401, "Login/Senha Incorreto!");
    }

    const jwtSecret = getUserServiceEnv().jwtSecret;

    const token = jwt.sign(
      {
        name: user.name,
        login: user.login,
        permission: user.permission,
      },
      jwtSecret,
      {
        subject: user.id,
        expiresIn: "1d",
      },
    );

    return {
      id: user.id,
      name: user.name,
      login: user.login,
      permission: user.permission,
      department_id: user.department_id,
      token,
    };
  }

  async firstCreate() {
    const userExists = await prismaClient.user.findFirst();
    if (userExists) {
      throw new ServiceError(409, "Login já cadastrado");
    }

    const org = await prismaClient.organization.findFirst();
    if (!org) {
      throw new ServiceError(400, "Execute o seed do banco antes de usar o firstCreate.");
    }

    const dep = await prismaClient.department.findFirst({
      where: { organization_id: org.id },
    });
    if (!dep) {
      throw new ServiceError(400, "Execute o seed do banco antes de usar o firstCreate.");
    }

    const { adminPassword } = getUserServiceEnv();
    const passwordHash = await bcrypt.hash(adminPassword, 8);

    try {
      const user = await prismaClient.user.create({
        data: {
          organization_id: org.id,
          name: "Admin",
          login: "Admin",
          password: passwordHash,
          permission: 2,
          status: "active",
          department_id: dep.id,
        },
        select: {
          id: true,
          name: true,
          login: true,
          permission: true,
          department_id: true,
        },
      });

      return { user };
    } catch (err: unknown) {
      const isUniqueViolation =
        err && typeof err === "object" && "code" in err && (err as { code: string }).code === "P2002";
      if (isUniqueViolation) {
        throw new ServiceError(409, "Login já cadastrado");
      }
      throw err;
    }
  }
}

export { AuthService };
