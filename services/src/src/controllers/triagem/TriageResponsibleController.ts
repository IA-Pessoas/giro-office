import { Request, Response } from "express";
import { TriageResponsibleService } from "../../services/triagem/TriageResponsibleService";

class TriageResponsibleController {

    public create = async (req: Request, res: Response) => {
        const service = new TriageResponsibleService();
        const { client_id, user_id, type } = req.body; // type é o 'obs'

        const result = await service.create({
            my_id: req.user_id,
            client_id,
            user_id,
            type
        });
        return res.json(result);
    }

    public list = async (req: Request, res: Response) => {
        const service = new TriageResponsibleService();
        const { client_id, type } = req.query;

        const result = await service.list(
            client_id as string, 
            type as string
        );
        return res.json(result);
    }

    public update = async (req: Request, res: Response) => {
        const service = new TriageResponsibleService();
        const { id, user_id, type } = req.body;

        const result = await service.update({
            my_id: req.user_id,
            id,
            user_id,
            type
        });
        return res.json(result);
    }

    public delete = async (req: Request, res: Response) => {
        const service = new TriageResponsibleService();
        const { id } = req.body;

        const result = await service.delete(req.user_id, id);
        return res.json(result);
    }
}

export { TriageResponsibleController };