import type { DepItem } from "@modules/departments";
import type { UserItem } from "@modules/users";

export interface AdminUserSession {
  id: string;
  name: string;
  permission: number;
  [key: string]: unknown;
}

interface AdminUserPageBaseProps {
  deps?: DepItem[];
  me?: AdminUserSession;
  forbidden?: boolean;
}

export interface UsersIndexPageProps extends AdminUserPageBaseProps {
  users?: UserItem[];
}

export interface UserDetailsPageProps extends AdminUserPageBaseProps {
  user?: UserItem;
}
