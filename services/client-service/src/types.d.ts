declare namespace Express {
  export interface Request {
    user_id: string;
    organization_id: string;
    /** Claim JWT `permission` (ex.: 2 = admin no legado). */
    permission?: number;
    requestId?: string;
  }
}
