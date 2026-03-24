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

const TASK_SERVICE_EXACT_PATHS = new Set([
  "/integracao-tasksModel",
  "/integracao-taskModel",
  "/integracao-tasksModel-dependent",
  "/integracao-taskModel-dependent",
]);

export function isTaskServiceRoute(path: string): boolean {
  return TASK_SERVICE_EXACT_PATHS.has(path);
}
