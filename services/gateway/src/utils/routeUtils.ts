/** Paths forwarded to **user-service** (`USER_SERVICE_URL`) before the legacy fallback. */
export function isUserServiceRoute(path: string): boolean {
  return (
    path === "/session" ||
    path === "/start-config" ||
    path === "/me" ||
    path === "/users" ||
    path.startsWith("/users/") ||
    path.startsWith("/permission/")
  );
}

/**
 * Gateway sends matching paths to **task-service** (`TASK_SERVICE_URL`). Unlisted paths hit the
 * legacy upstream. Add new exact paths here when exposing more task APIs through the gateway.
 */
const TASK_SERVICE_EXACT_PATHS = new Set([
  "/integracao-tasksModel",
  "/integracao-taskModel",
  "/integracao-tasksModel-dependent",
  "/integracao-taskModel-dependent",
  "/integracao-tasksIntegration",
  "/integracao-tasks",
  "/integracao-tasks-conclusion",
  "/integracao-tasks-completeRequest",
  "/integracao-task",
  "/comercial-tasks",
  "/financeiro-tasks",
]);

export function isTaskServiceRoute(path: string): boolean {
  return TASK_SERVICE_EXACT_PATHS.has(path);
}

const PROJECT_SERVICE_EXACT_PATHS = new Set([
  "/integracao-projects",
  "/integracao-project",
  "/integracao-project-progress",
]);

export function isProjectServiceRoute(path: string): boolean {
  return PROJECT_SERVICE_EXACT_PATHS.has(path);
}
