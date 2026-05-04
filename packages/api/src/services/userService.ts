import type { AxiosInstance } from "axios";

import type { MeProfile, MeApiResponse, MeSessionUser, UpdateCurrentUserPayload } from "../types/me.js";
import type { UserDetailApiResponse, UserItem } from "../types/user.js";

interface InternalMeRecord extends MeProfile {
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function extractPayloadData(payload: unknown): unknown {
  if (!isRecord(payload)) {
    return payload;
  }

  return "data" in payload ? payload.data : payload;
}

function extractUserPayload(payload: unknown): unknown {
  const data = extractPayloadData(payload);

  if (isRecord(data) && "user" in data) {
    return data.user;
  }

  return data;
}

function readOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function extractMeRecord(payload: unknown): InternalMeRecord {
  const userPayload = extractUserPayload(payload);

  if (!isRecord(userPayload)) {
    throw new Error("Unexpected current-user payload shape.");
  }

  const id = userPayload.id;
  const name = userPayload.name;
  const login = userPayload.login;
  const permission = userPayload.permission;

  if (
    typeof id !== "string" ||
    typeof name !== "string" ||
    typeof login !== "string" ||
    typeof permission !== "number"
  ) {
    throw new Error("Unexpected current-user payload shape.");
  }

  return {
    id,
    name,
    login,
    permission,
    photo_url: readOptionalString(userPayload.photo_url),
    organization_id: readOptionalString(userPayload.organization_id),
    type:
      userPayload.type === "owner" || userPayload.type === "admin" || userPayload.type === "user"
        ? userPayload.type
        : null,
  };
}

function toMeSessionUser(record: InternalMeRecord): MeSessionUser {
  return {
    id: record.id,
    name: record.name,
    login: record.login,
    permission: record.permission,
    photo_url: record.photo_url,
    organization_id: record.organization_id,
    type: record.type,
  };
}

function extractUserItem(payload: unknown): UserItem {
  const userPayload = extractUserPayload(payload);

  if (!isRecord(userPayload)) {
    throw new Error("Unexpected user payload shape.");
  }

  const id = userPayload.id;
  const name = userPayload.name;
  const login = userPayload.login;
  const permission = userPayload.permission;
  const departmentId = userPayload.department_id;
  const status = userPayload.status;

  if (
    typeof id !== "string" ||
    typeof name !== "string" ||
    typeof login !== "string" ||
    typeof permission !== "number" ||
    typeof departmentId !== "string" ||
    typeof status !== "string"
  ) {
    throw new Error("Unexpected user payload shape.");
  }

  const department = isRecord(userPayload.department)
    ? {
        name: typeof userPayload.department.name === "string" ? userPayload.department.name : "",
        color:
          typeof userPayload.department.color === "string" ? userPayload.department.color : "",
      }
    : undefined;

  return {
    id,
    name,
    login,
    permission,
    department_id: departmentId,
    status,
    photo_url: readOptionalString(userPayload.photo_url),
    department,
  };
}

async function getInternalMeRecord(client: AxiosInstance): Promise<InternalMeRecord> {
  const { data } = await client.get<MeApiResponse>("/user/me");
  return extractMeRecord(data);
}

export async function getUserById(client: AxiosInstance, id: string): Promise<UserItem> {
  const { data } = await client.get<UserDetailApiResponse>(`/user/${id}`);
  return extractUserItem(data);
}

export async function getMe(client: AxiosInstance): Promise<MeSessionUser> {
  const currentUser = await getInternalMeRecord(client);
  return toMeSessionUser(currentUser);
}

export async function updateCurrentUser(
  client: AxiosInstance,
  payload: UpdateCurrentUserPayload,
): Promise<MeSessionUser> {
  const currentUser = await getInternalMeRecord(client);
  const body: Record<string, string> = { name: payload.name };

  if (payload.password !== undefined && payload.password !== "") {
    body.password = payload.password;
  }

  const { data } = await client.patch(`/user/${currentUser.id}`, body);
  return toMeSessionUser(extractMeRecord(data));
}

export async function uploadCurrentUserPhoto(
  client: AxiosInstance,
  file: File,
): Promise<MeSessionUser> {
  const currentUser = await getInternalMeRecord(client);
  const formData = new FormData();

  formData.append("file", file);

  const { data } = await client.post(`/user/${currentUser.id}/photo`, formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });

  return toMeSessionUser(extractMeRecord(data));
}

export async function deleteCurrentUserPhoto(client: AxiosInstance): Promise<MeSessionUser> {
  const currentUser = await getInternalMeRecord(client);
  const { data } = await client.delete(`/user/${currentUser.id}/photo`);

  return toMeSessionUser(extractMeRecord(data));
}
