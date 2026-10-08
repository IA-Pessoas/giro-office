// O token do link é um segredo opaco de 32 bytes guardado só como SHA-256, igual ao CSRF.
import {
  createCsrfToken as createOpaqueToken,
  hashCsrfToken as sha256Hex,
} from "@workspace/runtime";
import { ServiceError } from "@workspace/shared/http";
import type { UserWorkerEnv } from "./env.js";
import type { Row, UserPrismaClient } from "./types.js";

/** Link de redefinição enviado pelo administrador (#1342): uso único, 1 hora. */
export const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;
/** Um envio por usuário a cada minuto, para não inundar a caixa de e-mail. */
const PASSWORD_RESET_COOLDOWN_MS = 60 * 1000;

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

// ponytail: o login serve de destino quando `email` está vazio; um admin que troca o login
// do alvo antes de pedir o link recebe o link. Fica auditado; restringir exige e-mail verificado.
function recipientOf(user: Row): string | null {
  if (typeof user.email === "string" && user.email.includes("@")) return user.email;
  if (typeof user.login === "string" && user.login.includes("@")) return user.login;
  return null;
}

/**
 * Grava o token (invalidando os anteriores) e devolve o envio separado, para a auditoria
 * registrar o pedido mesmo se o e-mail falhar.
 */
export async function issuePasswordReset(
  db: UserPrismaClient,
  target: Row,
  env: UserWorkerEnv,
  send: PasswordResetEmailSender | null,
): Promise<{ expiresAt: Date; deliver: () => Promise<void> }> {
  if (!send || !env.APP_PUBLIC_URL) {
    throw new ServiceError(503, "Envio de e-mail de redefinição não configurado.");
  }
  if (target.status !== "active") throw new ServiceError(409, "O usuário está inativo.");
  const to = recipientOf(target);
  if (!to) throw new ServiceError(422, "O usuário não tem e-mail cadastrado.");
  const userId = String(target.id);
  const recent = await db.passwordResetToken.findFirst({
    where: {
      user_id: userId,
      created_at: { gt: new Date(Date.now() - PASSWORD_RESET_COOLDOWN_MS) },
    },
    select: { id: true },
  });
  if (recent) throw new ServiceError(429, "Aguarde um minuto antes de enviar outro link.");

  const token = createOpaqueToken();
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MS);
  if (!db.$transaction) throw new ServiceError(503, "Redefinição de senha não configurada.");
  await db.$transaction(async (transaction) => {
    await transaction.passwordResetToken.updateMany({
      where: { user_id: userId, used_at: null },
      data: { used_at: new Date() },
    });
    await transaction.passwordResetToken.create({
      data: { user_id: userId, token_hash: await sha256Hex(token), expires_at: expiresAt },
    });
  });

  const link = new URL("/redefinir-senha", env.APP_PUBLIC_URL);
  link.searchParams.set("token", token);
  const deliver = async () => {
    try {
      await send({ to, name: String(target.name ?? ""), link: link.toString() });
    } catch (error) {
      console.error("Falha ao enviar e-mail de redefinição de senha", {
        event: "user.password_reset.email_failed",
        userId,
        message: error instanceof Error ? error.message : String(error),
      });
      throw new ServiceError(502, "Não foi possível enviar o e-mail de redefinição.");
    }
  };
  return { expiresAt, deliver };
}

/** A política mínima da senha já vem do schema da rota. */
export async function confirmPasswordReset(
  db: UserPrismaClient,
  input: { token: string; password: string },
  hashPassword: (password: string) => Promise<string>,
): Promise<{ userId: string }> {
  const invalid = new ServiceError(400, "Link de redefinição inválido ou expirado.");
  const reset = await db.passwordResetToken.findFirst({
    where: {
      token_hash: await sha256Hex(input.token),
      used_at: null,
      expires_at: { gt: new Date() },
    },
    select: { id: true, user_id: true },
  });
  if (!reset) throw invalid;
  const userId = String(reset.user_id);
  // Usuário desativado depois do envio não reativa a conta pelo link.
  const owner = await db.user.findFirst({
    where: { id: userId, status: "active" },
    select: { id: true },
  });
  if (!owner) throw invalid;
  const passwordHash = await hashPassword(input.password);
  if (!db.$transaction) throw new ServiceError(503, "Redefinição de senha não configurada.");
  await db.$transaction(
    async (transaction) => {
      const claimed = await transaction.passwordResetToken.updateMany({
        where: { id: reset.id, used_at: null },
        data: { used_at: new Date() },
      });
      if (claimed.count !== 1) throw invalid;
      await replacePassword(transaction, userId, passwordHash);
    },
    { isolationLevel: "Serializable" },
  );
  return { userId };
}

/** Grava a nova senha e derruba todas as sessões do usuário. */
async function replacePassword(
  transaction: UserPrismaClient,
  userId: string,
  passwordHash: string,
): Promise<void> {
  if (!transaction.user.updateMany || !transaction.authSession.updateMany) {
    throw new ServiceError(503, "Redefinição de senha não configurada.");
  }
  await transaction.user.updateMany({
    where: { id: userId },
    data: {
      password: passwordHash,
      session_version: { increment: 1 },
      version: { increment: 1 },
    },
  });
  await transaction.authSession.updateMany({
    where: { user_id: userId, revoked_at: null },
    data: { revoked_at: new Date() },
  });
}

/**
 * O TI define a senha de outro usuário (sem link). O alvo já passou pela checagem de
 * tenant e hierarquia; links pendentes deixam de valer.
 */
export async function setUserPassword(
  db: UserPrismaClient,
  target: Row,
  password: string,
  hashPassword: (password: string) => Promise<string>,
): Promise<void> {
  if (target.status !== "active") throw new ServiceError(409, "O usuário está inativo.");
  if (!db.$transaction) throw new ServiceError(503, "Redefinição de senha não configurada.");
  const userId = String(target.id);
  const passwordHash = await hashPassword(password);
  await db.$transaction(async (transaction) => {
    await replacePassword(transaction, userId, passwordHash);
    await transaction.passwordResetToken.updateMany({
      where: { user_id: userId, used_at: null },
      data: { used_at: new Date() },
    });
  });
}
