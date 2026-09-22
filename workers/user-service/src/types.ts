export type Row = Record<string, unknown>;

export interface UserPrismaClient {
  user: {
    findFirst(args: Record<string, unknown>): Promise<Row | null>;
    findMany(args: Record<string, unknown>): Promise<Row[]>;
    count(args: Record<string, unknown>): Promise<number>;
    updateMany?(args: Record<string, unknown>): Promise<{ count: number }>;
  };
  permission: {
    findFirst(args: Record<string, unknown>): Promise<Row | null>;
    updateMany(args: Record<string, unknown>): Promise<{ count: number }>;
  };
  permissionSpecific: {
    findFirst(args: Record<string, unknown>): Promise<Row | null>;
  };
  authSession: {
    findFirst(args: Record<string, unknown>): Promise<Row | null>;
  };
  platformAuthSession: {
    findFirst(args: Record<string, unknown>): Promise<Row | null>;
  };
  department: {
    findMany(args: Record<string, unknown>): Promise<Row[]>;
  };
  $disconnect(): Promise<void>;
}
