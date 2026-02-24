import { Request, Response } from "express";
import { LicenseService } from "../../services/regularize/LicenseService";

class LicenseController {    
    public create = async (req: Request, res: Response) => {
        const service = new LicenseService();
        // O my_id vem do middleware de autenticação (req.user_id)
        const result = await service.create({ ...req.body, my_id: req.user_id });
        return res.json(result);
    }

    public update = async (req: Request, res: Response) => {
        const service = new LicenseService();
        const result = await service.update({ ...req.body, my_id: req.user_id });
        return res.json(result);
    }

    public detail = async (req: Request, res: Response) => {
        const { id } = req.query;
        const service = new LicenseService();
        const result = await service.detail(id as string);
        return res.json(result);
    }

    public list = async (req: Request, res: Response) => {
        const { status } = req.body;
        const service = new LicenseService();
        const result = await service.list(status as string);
        return res.json(result);
    }
}

export { LicenseController };