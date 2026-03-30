import type { AxiosInstance } from "axios";
import type { UserDetailApiResponse, UserItem } from "../types/user.js";

export async function getUserById(client: AxiosInstance, id: string): Promise<UserItem> {
  const { data } = await client.get<UserDetailApiResponse>("/users-detail", {
    params: { user_id: id },
  });
  return data.user;
}
