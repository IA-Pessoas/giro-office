import { Request, Response } from "express";
import { CloudService } from "../../services/triagem/CloudService";

class CloudController {

    public create = async (req: Request, res: Response) => {
        const service = new CloudService();
        const { client_id, type, link } = req.body;

        const result = await service.create({
            my_id: req.user_id,
            client_id,
            type,
            link
        });
        return res.json(result);
    }

    public list = async (req: Request, res: Response) => {
        const service = new CloudService();
        const { client_id } = req.query;

        if (!client_id) {
            return res.status(400).json({ error: "client_id é obrigatório" });
        }

        const result = await service.listByClient(String(client_id));
        return res.json(result);
    }

    public update = async (req: Request, res: Response) => {
        const service = new CloudService();
        const { id, type, link } = req.body;

        const result = await service.update({
            my_id: req.user_id,
            id,
            type,
            link
        });
        return res.json(result);
    }

    public delete = async (req: Request, res: Response) => {
        const service = new CloudService();
        const { id } = req.body; // ID do registro da nuvem

        const result = await service.delete(req.user_id, id);
        return res.json(result);
    }
}

export { CloudController };