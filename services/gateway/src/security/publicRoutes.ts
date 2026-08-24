import { normalizeGatewayPath } from "./routeClassification.js";

export interface PublicRoute {
  reason: string;
}

const publicRoutes = new Map<string, PublicRoute>([
  ["GET /health", { reason: "Expõe a verificação de saúde do gateway." }],
  ["GET /ready", { reason: "Expõe a verificação de prontidão do gateway." }],
  ["POST /user/session", { reason: "Cria uma sessão sem contexto autenticado." }],
  ["POST /platform/session", { reason: "Cria uma sessão de plataforma sem contexto autenticado." }],
  ["POST /user/start-config", { reason: "Inicializa a configuração sem contexto autenticado." }],
]);

const socketIoPublicRoute: PublicRoute = {
  reason: "Encaminha o handshake Socket.IO, autenticado pelo serviço de tempo real.",
};

function isSocketIoPath(path: string): boolean {
  return path === "/socket.io" || path.startsWith("/socket.io/");
}

export function getPublicRoute(method: string, path: string): PublicRoute | null {
  const normalizedPath = normalizeGatewayPath(path);
  if (!normalizedPath) {
    return null;
  }

  if (isSocketIoPath(normalizedPath)) {
    return socketIoPublicRoute;
  }

  return publicRoutes.get(`${method.toUpperCase()} ${normalizedPath}`) ?? null;
}

export function isPublicRoute(method: string, path: string): boolean {
  return getPublicRoute(method, path) !== null;
}
