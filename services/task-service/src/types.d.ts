declare global {
  namespace Express {
    interface Request {
      user_id: string;
      organization_id: string;
      permission?: number;
      user_type?: "owner" | "admin" | "user";
      modules?: Record<string, number>;
      requestId?: string;
    }
  }
}

export {};
