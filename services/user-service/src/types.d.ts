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
      requestId?: string;
      file?: Multer.File;
    }
  }
}

export {};
