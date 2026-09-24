import { createCsrfToken, hashCsrfToken } from "@workspace/runtime";
import { ServiceError } from "@workspace/shared/http";
import { MIN_PASSWORD_LENGTH } from "../../../services/user-service/src/schemas/user.schemas.js";
import type { UserWorkerEnv } from "./env.js";
import type { UserPrismaClient } from "./types.js";

/** Link de redefinição enviado pelo administrador (#1342): uso único, 1 hora. */
export const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;

export type PasswordResetEmail = { to: string; name: string; link: string };
export type PasswordResetEmailSender = (message: PasswordResetEmail) => Promise<void>;

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char,
  );
}

/** Mesmo contrato do adaptador HTTP de e-mail do commercial-service. */
export function httpPasswordResetEmailSender(env: UserWorkerEnv): PasswordResetEmailSender | null {
  const { USER_EMAIL_ADAPTER_URL: url, USER_EMAIL_ADAPTER_TOKEN: token } = env;
  const from = env.USER_EMAIL_FROM;
  if (!url || !token || !from) return null;
  return async ({ to, name, link }) => {
    const response = await fetch(url, {
      method: "POST",
      signal: AbortSignal.timeout(10_000),
      headers: { "content-type": "application/json", "x-internal-service-token": token },
      body: JSON.stringify({
        from,
        recipients: [{ email: to, responsible: name }],
        subject: "Redefinição de senha do Giro Office",
        html: `<p>Olá, ${escapeHtml(name)}.</p><p>Um administrador pediu a redefinição da sua senha. Use o link abaixo em até 1 hora; ele só funciona uma vez.</p><p><a href="${escapeHtml(link)}">Definir nova senha</a></p><p>Se você não esperava este e-mail, ignore-o.</p>`,
      }),
    });
    if (!response.ok) throw new Error(`Adapter de email respondeu ${response.status}.`);
  };
}

function recipientOf(user: Record<string, unknown>): string | null {
  if (typeof user.email === "string" && user.email.includes("@")) return user.email;
  if (typeof user.login === "string" && user.login.includes("@")) return user.login;
  return null;
}

export async function requestPasswordReset(
  db: UserPrismaClient,
  target: Record<string, unknown>,
  env: UserWorkerEnv,
  send: PasswordResetEmailSender | null,
): Promise<{ expiresAt: Date }> {
  if (!send || !env.APP_PUBLIC_URL) {
    throw new ServiceError(503, "Envio de e-mail de redefinição não configurado.");
  }
  if (target.status !== "active") throw new ServiceError(409, "O usuário está inativo.");
  const to = recipientOf(target);
  if (!to) throw new ServiceError(422, "O usuário não tem e-mail cadastrado.");

  const token = createCsrfToken();
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MS);
  const userId = String(target.id);
  if (!db.$transaction) throw new ServiceError(503, "Redefinição de senha não configurada.");
  await db.$transaction(async (transaction) => {
    await transaction.passwordResetToken.updateMany({
      where: { user_id: userId, used_at: null },
      data: { used_at: new Date() },
    });
    await transaction.passwordResetToken.create({
      data: { user_id: userId, token_hash: await hashCsrfToken(token), expires_at: expiresAt },
    });
  });

  const link = new URL("/redefinir-senha", env.APP_PUBLIC_URL);
  link.searchParams.set("token", token);
  try {
    await send({ to, name: String(target.name ?? ""), link: link.toString() });
  } catch {
    throw new ServiceError(502, "Não foi possível enviar o e-mail de redefinição.");
  }
  return { expiresAt };
}

export async function confirmPasswordReset(
  db: UserPrismaClient,
  input: { token: string; password: string },
  hashPassword: (password: string) => Promise<string>,
): Promise<{ userId: string }> {
  if (input.password.length < MIN_PASSWORD_LENGTH) {
    throw new ServiceError(
      400,
      `A nova senha deve ter ao menos ${MIN_PASSWORD_LENGTH} caracteres.`,
    );
  }
  const invalid = new ServiceError(400, "Link de redefinição inválido ou expirado.");
  const reset = await db.passwordResetToken.findFirst({
    where: {
      token_hash: await hashCsrfToken(input.token),
      used_at: null,
      expires_at: { gt: new Date() },
    },
    select: { id: true, user_id: true },
  });
  if (!reset) throw invalid;
  const userId = String(reset.user_id);
  const passwordHash = await hashPassword(input.password);
  if (!db.$transaction || !db.user.updateMany || !db.authSession.updateMany) {
    throw new ServiceError(503, "Redefinição de senha não configurada.");
  }
  await db.$transaction(
    async (transaction) => {
      const claimed = await transaction.passwordResetToken.updateMany({
        where: { id: reset.id, used_at: null },
        data: { used_at: new Date() },
      });
      if (claimed.count !== 1) throw invalid;
      await transaction.user.updateMany?.({
        where: { id: userId },
        data: {
          password: passwordHash,
          session_version: { increment: 1 },
          version: { increment: 1 },
        },
      });
      await transaction.authSession.updateMany?.({
        where: { user_id: userId, revoked_at: null },
        data: { revoked_at: new Date() },
      });
    },
    { isolationLevel: "Serializable" },
  );
  return { userId };
}
