declare namespace Express {
  export interface Request {
    user_id: string;
    requestId?: string;
    organization_id?: string;
  }
}
