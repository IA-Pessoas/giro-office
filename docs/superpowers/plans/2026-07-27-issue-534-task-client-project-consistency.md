# Issue #534 Task Client Project Consistency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reject direct task creation when the selected project is absent from the organization or belongs to a different client.

**Architecture:** Validate the project once in `TaskCrudService.createTask` before persistence, scoped by `organization_id`, then compare its persisted `client_id` with the request. This protects every route caller without changing the HTTP payload or schema.

**Tech Stack:** TypeScript, Prisma, Express, Vitest.

## Global Constraints

- Keep validation in the service; the route continues to parse the existing body schema once.
- Fetch only `client_id` for the one project lookup; this cold create path remains constant-time database I/O.
- Return `404` for a project outside the organization and `400` for a project/client mismatch.
- Do not add a migration or broad schema redesign: the issue requests application-level integrity and the current model cannot express the cross-table invariant with a small standalone constraint.

---

### Task 1: Validate project ownership before creating a task

**Files:**
- Modify: `services/task-service/src/services/taskCrudService.ts`
- Modify: `services/task-service/src/test/taskCrudService.test.ts`

**Interfaces:**
- Consumes: `CreateTaskCrudRequest` with `organization_id`, `project_id`, and `client_id`.
- Produces: `Promise<{ create: TaskCreateRow }>` only when the project exists in that organization and `project.client_id === data.client_id`.

- [ ] **Step 1: Write failing service tests**

  Extend the hoisted Prisma double with `project.findFirst`. Add a case where the project is in `org-1` but has `client_id: "client-2"` while the request has `client_id: "client-1"`:

  ```ts
  await expect(service.createTask(request)).rejects.toMatchObject({
    statusCode: 400,
    message: "Projeto nao pertence ao cliente informado.",
  });
  expect(prismaMock.task.create).not.toHaveBeenCalled();
  ```

  Add a second case for a missing organization-scoped project that expects `404`, and a valid-project case that reaches `task.create`.

- [ ] **Step 2: Verify the tests are red**

  Run: `corepack pnpm --filter @workspace/task-service test -- taskCrudService.test.ts`

  Expected: the mismatch and missing-project cases fail before validation exists.

- [ ] **Step 3: Implement the single project lookup and comparisons**

  At the beginning of `createTask`, query:

  ```ts
  const project = await prismaClient.project.findFirst({
    where: { id: data.project_id, organization_id: data.organization_id },
    select: { client_id: true },
  });
  ```

  Throw `new ServiceError(404, "Projeto nao encontrado.")` when absent and `new ServiceError(400, "Projeto nao pertence ao cliente informado.")` when IDs differ. Continue with the existing duplicate, model, creation, audit, dependent-task, and workflow flow unchanged.

- [ ] **Step 4: Verify focused regression and service compilation**

  Run:

  ```bash
  corepack pnpm --filter @workspace/task-service test -- taskCrudService.test.ts taskCrud.routes.test.ts
  corepack pnpm --filter @workspace/task-service typecheck
  ```

  Expected: both commands exit 0.

- [ ] **Step 5: Commit the focused change**

  ```bash
  git add services/task-service/src/services/taskCrudService.ts services/task-service/src/test/taskCrudService.test.ts docs/superpowers/plans/2026-07-27-issue-534-task-client-project-consistency.md
  git commit -m "fix: validate task project client consistency"
  ```
