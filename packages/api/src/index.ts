export { type CreateApiClientOptions, createApiClient } from "./client.js";
export { getMe, getUserById, updateCurrentUser } from "./services/userService.js";
export type {
  MeApiResponse,
  MeSessionUser,
  UpdateCurrentUserPayload,
} from "./types/me.js";
export type { ApiUserDepartment, UserDetailApiResponse, UserItem } from "./types/user.js";
