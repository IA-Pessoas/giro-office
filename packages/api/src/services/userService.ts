import type { AxiosInstance } from "axios";

import type { MeApiResponse, MeSessionUser, UpdateCurrentUserPayload } from "../types/me.js";
import type { UserDetailApiResponse, UserItem } from "../types/user.js";

export async function getUserById(client: AxiosInstance, id: string): Promise<UserItem> {
  const { data } = await client.get<UserDetailApiResponse>("/users-detail", {
    params: { user_id: id },
  });
  return data.user;
}

export async function getMe(client: AxiosInstance): Promise<MeSessionUser> {
  const { data } = await client.get<MeApiResponse>("/me");
  return data.user;
}

export async function updateCurrentUser(
  client: AxiosInstance,
  payload: UpdateCurrentUserPayload,
): Promise<void> {
  const body: Record<string, string | number> = {
    name: payload.name,
    permission: payload.permission,
    status: payload.status,
  };
  if (payload.password !== undefined && payload.password !== "") {
    body.password = payload.password;
  }
  await client.put("/users", body);
}
