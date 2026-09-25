// Porte de request.routes.ts e message.routes.ts do rh-service Node.
import {
  createMessageBodySchema,
  listMessagesQuerySchema,
} from "@workspace/rh-service/src/schemas/message.schemas.js";
import {
  createRequestBodySchema,
  deleteRequestBodySchema,
  listRequestQuerySchema,
  requestIdParamsSchema,
  updateRequestBodySchema,
} from "@workspace/rh-service/src/schemas/request.schemas.js";
import { error as logError, parseWithZod } from "@workspace/shared";
import { createSuccessResponse, ServiceError } from "@workspace/shared/http";
import { validateUploadFileSignature } from "@workspace/shared/upload";
import { requireRhPermission } from "../auth.js";
import { MessageService } from "../services/messageService.js";
import {
  type RequestCreateInput,
  type RequestListOptions,
  RequestService,
  type RequestUpdateInput,
} from "../services/requestService.js";
import {
  isRhRequestMessageObjectPath,
  RH_REQUEST_MESSAGE_MIME_TYPES,
  type RhRequestMessageAttachmentStorage,
  rhRequestMessageStorageFromEnv,
} from "../services/rhRequestMessageStorage.js";
import {
  canManageRh,
  jsonBody,
  RH_MANAGEMENT_PERMISSION,
  RH_SELF_SERVICE_PERMISSION,
  RH_WORKFLOW_MESSAGE_PERMISSION,
  type RhApp,
  type RhContext,
  type RhRouteDeps,
  rhPermissionLevel,
  trimmedQuery,
  uploadedFile,
} from "./shared.js";

function withSignedAttachment(
  message: unknown,
  organizationId: string,
  requestId: string,
  storage: RhRequestMessageAttachmentStorage,
): Promise<unknown> {
  if (!message || typeof message !== "object" || Array.isArray(message)) {
    return Promise.resolve(message);
  }
  const record = message as Record<string, unknown>;
  const objectPath = record.attachment;
  if (objectPath === undefined || objectPath === null) return Promise.resolve(message);
  if (
    typeof objectPath !== "string" ||
    !isRhRequestMessageObjectPath(objectPath, organizationId, requestId)
  ) {
    // Anexos legados ou URLs públicas ficam em quarentena: nunca devolvemos o valor bruto.
    return Promise.resolve({ ...record, attachment: null });
  }
  return storage
    .createSignedAccessUrl(objectPath)
    .then((signedUrl) => ({ ...record, attachment: signedUrl }));
}

/** multer deixa os campos de texto em `req.body`; JSON segue pelo `express.json`. */
async function messageBody(c: RhContext): Promise<unknown> {
  if (!c.req.header("content-type")?.includes("multipart/form-data")) return jsonBody(c);
  let form: FormData;
  try {
    form = await c.req.formData();
  } catch {
    throw new ServiceError(400, "Upload de arquivo inválido.");
  }
  const fields: Record<string, string> = {};
  form.forEach((value, key) => {
    if (typeof value === "string") fields[key] = value;
  });
  return fields;
}

export function registerRequestRoutes(app: RhApp, deps: RhRouteDeps): void {
  app.post("/rh/requests", async (c) => {
    const auth = c.get("auth");
    requireRhPermission(auth, RH_SELF_SERVICE_PERMISSION);
    const body = parseWithZod(createRequestBodySchema, await jsonBody(c));
    const createInput: RequestCreateInput = {
      organization_id: auth.organizationId,
      requester_user_id: auth.userId,
      title: body.title,
      description: body.description,
      category_id: body.category_id,
      urgency: body.urgency,
    };
    if (canManageRh(auth) && body.assigned_to_user_id !== undefined) {
      createInput.assigned_to_user_id = body.assigned_to_user_id;
    }
    const result = await deps.withDb(c, (db) => new RequestService(db).create(createInput));
    return c.json(createSuccessResponse(result));
  });

  app.get("/rh/requests", async (c) => {
    const auth = c.get("auth");
    requireRhPermission(auth, RH_SELF_SERVICE_PERMISSION);
    const parsed = parseWithZod(listRequestQuerySchema, {
      page: trimmedQuery(c, "page"),
      limit: trimmedQuery(c, "limit"),
      status: trimmedQuery(c, "status"),
      category_id: trimmedQuery(c, "category_id"),
      requester_user_id: trimmedQuery(c, "requester_user_id"),
      assigned_to_user_id: trimmedQuery(c, "assigned_to_user_id"),
    });
    const listOptions: RequestListOptions = { page: parsed.page, limit: parsed.limit };
    if (parsed.status !== undefined) listOptions.status = parsed.status;
    if (parsed.category_id !== undefined) listOptions.category_id = parsed.category_id;
    if (parsed.requester_user_id !== undefined) {
      listOptions.requester_user_id = parsed.requester_user_id;
    }
    if (parsed.assigned_to_user_id !== undefined) {
      listOptions.assigned_to_user_id = parsed.assigned_to_user_id;
    }
    if (!canManageRh(auth)) {
      listOptions.participant_user_id = auth.userId;
      delete listOptions.requester_user_id;
      delete listOptions.assigned_to_user_id;
    }
    const result = await deps.withDb(c, (db) =>
      new RequestService(db).list(auth.organizationId, listOptions),
    );
    return c.json(createSuccessResponse(result));
  });

  app.get("/rh/requests/:id", async (c) => {
    const auth = c.get("auth");
    requireRhPermission(auth, RH_SELF_SERVICE_PERMISSION);
    const params = parseWithZod(requestIdParamsSchema, c.req.param());
    const result = await deps.withDb(c, async (db) => {
      const service = new RequestService(db);
      const found = await service.getById(params.id, auth.organizationId);
      if (
        !canManageRh(auth) &&
        found.requester_user_id !== auth.userId &&
        found.assigned_to_user_id !== auth.userId
      ) {
        throw new ServiceError(403, "Permissão insuficiente para acessar solicitação de terceiro.");
      }
      await service.markOpened({
        organization_id: auth.organizationId,
        request_id: found.id,
        user_id: auth.userId,
      });
      return found;
    });
    return c.json(createSuccessResponse(result));
  });

  app.put("/rh/requests", async (c) => {
    const auth = c.get("auth");
    requireRhPermission(auth, RH_MANAGEMENT_PERMISSION);
    const body = parseWithZod(updateRequestBodySchema, await jsonBody(c));
    const updateInput: RequestUpdateInput = {
      id: body.id,
      organization_id: auth.organizationId,
      actor_user_id: auth.userId,
    };
    if (body.title !== undefined) updateInput.title = body.title;
    if (body.description !== undefined) updateInput.description = body.description;
    if (body.category_id !== undefined) updateInput.category_id = body.category_id;
    if (body.assigned_to_user_id !== undefined) {
      updateInput.assigned_to_user_id = body.assigned_to_user_id;
    }
    if (body.urgency !== undefined) updateInput.urgency = body.urgency;
    if (body.status !== undefined) updateInput.status = body.status;
    const result = await deps.withDb(c, (db) => new RequestService(db).update(updateInput));
    return c.json(createSuccessResponse(result));
  });

  app.delete("/rh/requests", async (c) => {
    const auth = c.get("auth");
    requireRhPermission(auth, RH_MANAGEMENT_PERMISSION);
    const body = parseWithZod(deleteRequestBodySchema, await jsonBody(c));
    const result = await deps.withDb(c, (db) =>
      new RequestService(db).delete({ id: body.id, organization_id: auth.organizationId }),
    );
    return c.json(createSuccessResponse(result));
  });

  app.post("/rh/messages", async (c) => {
    const auth = c.get("auth");
    requireRhPermission(auth, RH_SELF_SERVICE_PERMISSION);
    const organizationId = auth.organizationId;
    const storage = rhRequestMessageStorageFromEnv(deps.env(c));
    const isMultipart = c.req.header("content-type")?.includes("multipart/form-data") === true;
    const file = isMultipart
      ? await uploadedFile(c, "file", {
          allowedMimeTypes: RH_REQUEST_MESSAGE_MIME_TYPES,
          maxSizeBytes: 10 * 1024 * 1024,
        })
      : undefined;
    const body = parseWithZod(createMessageBodySchema, await messageBody(c));
    const canManage = canManageRh(auth);
    const canUseWorkflowMessages = rhPermissionLevel(auth) >= RH_WORKFLOW_MESSAGE_PERMISSION;
    if (!canUseWorkflowMessages && body.type === "Solution") {
      throw new ServiceError(403, "RH Visualizador pode enviar somente mensagens.");
    }

    let uploadedObjectPath: string | undefined;
    try {
      const result = await deps.withDb(c, async (db) => {
        const service = new MessageService(db);
        await service.assertCanCreate({
          organization_id: organizationId,
          sender_user_id: auth.userId,
          request_id: body.request_id,
          type: body.type,
          can_manage_rh: canManage,
          can_use_rh_workflow_messages: canUseWorkflowMessages,
        });

        let attachment = body.attachment;
        if (file) {
          validateUploadFileSignature(file);
          const objectPath = await storage.upload({
            organizationId,
            requestId: body.request_id,
            file: {
              buffer: file.buffer,
              mimetype: file.mimetype as (typeof RH_REQUEST_MESSAGE_MIME_TYPES)[number],
            },
          });
          if (!isRhRequestMessageObjectPath(objectPath, organizationId, body.request_id)) {
            throw new ServiceError(500, "Armazenamento retornou uma chave de anexo inválida.");
          }
          uploadedObjectPath = objectPath;
          attachment = objectPath;
        }

        const created = await service.create({
          organization_id: organizationId,
          sender_user_id: auth.userId,
          request_id: body.request_id,
          message: body.message,
          type: body.type,
          ...(attachment !== undefined ? { attachment } : {}),
          can_manage_rh: canManage,
          can_use_rh_workflow_messages: canUseWorkflowMessages,
        });
        return withSignedAttachment(created, organizationId, body.request_id, storage);
      });
      return c.json(createSuccessResponse(result));
    } catch (err) {
      if (uploadedObjectPath) {
        const orphan = uploadedObjectPath;
        await storage.remove(orphan).catch((cleanupError) => {
          logError("Erro ao remover anexo órfão de mensagem RH", {
            err: cleanupError,
            objectPath: orphan,
          });
        });
      }
      throw err;
    }
  });

  app.get("/rh/messages", async (c) => {
    const auth = c.get("auth");
    requireRhPermission(auth, RH_SELF_SERVICE_PERMISSION);
    const query = parseWithZod(listMessagesQuerySchema, c.req.query());
    const storage = rhRequestMessageStorageFromEnv(deps.env(c));
    const messages = await deps.withDb(c, async (db) => {
      const result = await new MessageService(db).listByRequest({
        organization_id: auth.organizationId,
        user_id: auth.userId,
        request_id: query.requestId,
        can_manage_rh: canManageRh(auth),
      });
      return Promise.all(
        result.map((message) =>
          withSignedAttachment(message, auth.organizationId, query.requestId, storage),
        ),
      );
    });
    return c.json(createSuccessResponse(messages));
  });
}
