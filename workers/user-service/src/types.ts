export type Row = Record<string, unknown>;

export interface UserPrismaClient {
  user: {
    findFirst(args: Record<string, unknown>): Promise<Row | null>;
    findMany(args: Record<string, unknown>): Promise<Row[]>;
    count(args: Record<string, unknown>): Promise<number>;
    updateMany?(args: Record<string, unknown>): Promise<{ count: number }>;
    create?(args: Record<string, unknown>): Promise<Row>;
  };
  permission: {
    findFirst(args: Record<string, unknown>): Promise<Row | null>;
    create?(args: Record<string, unknown>): Promise<Row>;
    updateMany(args: Record<string, unknown>): Promise<{ count: number }>;
  };
  permissionSpecific: {
    findFirst(args: Record<string, unknown>): Promise<Row | null>;
  };
  authSession: {
    findFirst(args: Record<string, unknown>): Promise<Row | null>;
    create?(args: Record<string, unknown>): Promise<Row>;
    updateMany?(args: Record<string, unknown>): Promise<{ count: number }>;
  };
  passwordResetToken: {
    findFirst(args: Record<string, unknown>): Promise<Row | null>;
    create(args: Record<string, unknown>): Promise<Row>;
    updateMany(args: Record<string, unknown>): Promise<{ count: number }>;
  };
  platformAuthSession: {
    findFirst(args: Record<string, unknown>): Promise<Row | null>;
    create?(args: Record<string, unknown>): Promise<Row>;
    updateMany?(args: Record<string, unknown>): Promise<{ count: number }>;
  };
  platformUser: {
    findFirst(args: Record<string, unknown>): Promise<Row | null>;
    findUnique(args: Record<string, unknown>): Promise<Row | null>;
  };
  department: {
    findMany(args: Record<string, unknown>): Promise<Row[]>;
    findFirst?(args: Record<string, unknown>): Promise<Row | null>;
  };
  organization: {
    findFirst(args: Record<string, unknown>): Promise<Row | null>;
  };
  $transaction?<T>(
    callback: (client: UserPrismaClient) => Promise<T>,
    options?: Record<string, unknown>,
  ): Promise<T>;
  $disconnect(): Promise<void>;
}
