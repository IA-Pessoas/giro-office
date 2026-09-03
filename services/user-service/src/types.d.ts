declare global {
  namespace Express {
    namespace Multer {
      interface File {
        fieldname: string;
        originalname: string;
        encoding: string;
        mimetype: string;
        size: number;
        buffer: Buffer;
        destination?: string;
        filename?: string;
        path?: string;
      }
    }

    interface Request {
      user_id: string;
      organization_id: string;
      permission?: number;
      user_type?: "owner" | "admin" | "user";
      modules?: Record<string, number>;
      session_version?: number;
      session_id?: string;
      csrf_hash?: string;
      platform_identity?: {
        id: string;
        name: string;
        email: string;
        auth_kind: "platform";
        platform_role: "super_admin";
      };
      platform_session?: {
        user_id: string;
        auth_kind: "platform";
        platform_role: "super_admin";
        session_version: number;
        session_id: string;
        csrf_hash: string;
      };
      requestId?: string;
      file?: Multer.File;
    }
  }
}

export {};
