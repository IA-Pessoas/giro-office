/** Paths forwarded to **user-service** (`USER_SERVICE_URL`) before the legacy fallback. */
export function isUserServiceRoute(path: string): boolean {
  return (
    path === "/user" ||
    path.startsWith("/user/") ||
    path === "/session" ||
    path === "/me" ||
    path === "/users" ||
    path.startsWith("/users/") ||
    path.startsWith("/permission/")
  );
}

const DEPARTMENT_SERVICE_EXACT_PATHS = new Set(["/departments", "/department"]);

export function isDepartmentServiceRoute(path: string): boolean {
  return DEPARTMENT_SERVICE_EXACT_PATHS.has(path);
}

const TASK_SERVICE_EXACT_PATHS = new Set([
  "/integracao-tasksModel",
  "/integracao-taskModel",
  "/integracao-tasksModel-dependent",
  "/integracao-taskModel-dependent",
  "/integracao-tasksIntegration",
  "/integracao-depsTasks",
  "/integracao-tasks",
  "/integracao-tasks-conclusion",
  "/integracao-tasks-completeRequest",
  "/integracao-task",
  "/comercial-tasks",
  "/financeiro-tasks",
  "/integracao-plans",
  "/integracao-plan",
  "/integracao-plans-tasks",
  "/integracao-plans-hire",
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
