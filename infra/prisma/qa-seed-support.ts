import argon2 from "argon2";

/** Parâmetros do hash de senha das fixtures QA; iguais aos do cadastro real de usuários. */
export function hashQaPassword(password: string): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id as 2,
    version: 0x13,
    memoryCost: 19 * 1024,
    timeCost: 2,
    parallelism: 1,
  });
}

export const PERMISSION_MODULE_NAMES = [
  "certificado",
  "comercial",
  "contabil",
  "financeiro",
  "fiscal",
  "integracao",
  "marketing",
  "parcelamento",
  "pessoal",
  "regularize",
  "rh",
  "ti",
  "triagem",
] as const;

/** `rh >= 3` é o que torna o usuário elegível como responsável de Tarefa no seu departamento. */
export const RH_LEADERSHIP_LEVEL = 3;

interface PermissionClient {
  permission: {
    findFirst(args: {
      where: { user_id: string; organization_id: string };
      select: { id: true };
    }): Promise<{ id: string } | null>;
    update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<unknown>;
    create(args: { data: Record<string, unknown> }): Promise<unknown>;
  };
}

interface QaPermissionInput {
  userId: string;
  organizationId: string;
  /** Nível do módulo `integracao`; os demais módulos ficam em 0. */
  integracaoLevel: number;
  /** Concede liderança de RH, sem a qual o usuário não aparece como responsável elegível. */
  rhLeadership?: boolean;
}

export async function upsertQaPermission(
  prisma: PermissionClient,
  { userId, organizationId, integracaoLevel, rhLeadership = false }: QaPermissionInput,
): Promise<void> {
  const data = {
    user_id: userId,
    organization_id: organizationId,
    ...Object.fromEntries(
      PERMISSION_MODULE_NAMES.map((moduleName) => [
        moduleName,
        moduleName === "integracao" ? integracaoLevel : 0,
      ]),
    ),
    rh: rhLeadership ? RH_LEADERSHIP_LEVEL : 0,
  };

  const existing = await prisma.permission.findFirst({
    where: { user_id: userId, organization_id: organizationId },
    select: { id: true },
  });

  if (existing) {
    await prisma.permission.update({ where: { id: existing.id }, data });
    return;
  }

  await prisma.permission.create({ data });
}
