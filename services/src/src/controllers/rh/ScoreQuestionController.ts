import { Request, Response } from "express";
import { ScoreQuestionService } from "../../services/rh/ScoreQuestionService";

class ScoreQuestionController {

    public create = async (req: Request, res: Response) => {
        const service = new ScoreQuestionService();
        const result = await service.create({
            ...req.body,
            my_id: req.user_id
        });
        return res.json(result);
    }

    public update = async (req: Request, res: Response) => {
        const service = new ScoreQuestionService();
        const { id, ...data } = req.body;
        
        const result = await service.update({
            id,
            ...data,
            my_id: req.user_id
        });
        return res.json(result);
    }

    public list = async (req: Request, res: Response) => {
        const service = new ScoreQuestionService();
        const type = req.query.type as string;
        // Se passar ?all=true na URL, traz as inativas também
        const showInactive = req.query.all === 'true';

        const result = await service.list(type, showInactive);
        return res.json(result);
    }

    public delete = async (req: Request, res: Response) => {
        const service = new ScoreQuestionService();
        const { id } = req.body;
        
        const result = await service.delete(req.user_id, id);
        return res.json(result);
    }
}

export { ScoreQuestionController };