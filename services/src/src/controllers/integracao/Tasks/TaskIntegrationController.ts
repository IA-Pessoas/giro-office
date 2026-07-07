import { Request, Response } from "express";
import { TaskIntegrationService } from "../../../services/integracao/Tasks/TaskIntegrationService";

class TaskIntegrationController {
    public create = async (req: Request, res: Response) => {
        const { task_model_id, referring, referring_type } = req.body;
        const service = new TaskIntegrationService();

        const result = await service.createLink({
            my_id: req.user_id,
            task_model_id,
            referring,
            referring_type
        });

        return res.json(result);
    }

    public remove = async (req: Request, res: Response) => {
        const { integration_id } = req.body; // ID do vínculo
        const service = new TaskIntegrationService();

        const result = await service.removeLink(req.user_id, integration_id);

        return res.json(result);
    }

    public list = async (req: Request, res: Response) => {
        const { task_model_id } = req.query; // Opcional
        const service = new TaskIntegrationService();

        const result = await service.list(task_model_id as string);

        return res.json(result);
    }
}

export { TaskIntegrationController };