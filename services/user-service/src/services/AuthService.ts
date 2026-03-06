import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

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
      throw new Error("Login/Senha Incorreto!");
    }

    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      throw new Error("Login/Senha Incorreto!");
    }

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      throw new Error("JWT_SECRET não está definido nas variáveis de ambiente.");
    }

    const token = jwt.sign(
      {
        name: user.name,
        login: user.login,
        permission: user.permission,
      },
      jwtSecret,
      {
        subject: user.id,
        expiresIn: "365d",
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
      throw new Error("Login já cadastrado");
    }

    const org = await prismaClient.organization.findFirst();
    if (!org) {
      throw new Error("Execute o seed do banco antes de usar o firstCreate.");
    }

    const dep = await prismaClient.department.findFirst({
      where: { organization_id: org.id },
    });
    if (!dep) {
      throw new Error("Execute o seed do banco antes de usar o firstCreate.");
    }

    const passwordHash = await bcrypt.hash("Admin", 8);

    const user = await prismaClient.user.create({
      data: {
        organization_id: org.id,
        name: "Admin",
        login: "Admin",
        password: passwordHash,
        permission: 2,
        status: "Ativo",
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
  }
}

export { AuthService };
