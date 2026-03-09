declare namespace Express{
    export interface Request{
        user_id: string;
        organization_id?: string;
        file: Express.Multer.File;
        files?: Record<string, UploadedFile | UploadedFile[]>
    }
}