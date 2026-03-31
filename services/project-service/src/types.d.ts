declare global {
  namespace Express {
    interface Request {
      user_id: string;
      organization_id: string;
      permission?: number;
    }
  }
}

export {};
