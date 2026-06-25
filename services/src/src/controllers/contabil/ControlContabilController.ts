import { Request, Response } from "express";
import { ControlContabilService } from "../../services/contabil/ControlContabilService";

class ControlContabilController {
    public create = async (request: Request, response: Response) => {
        const { clientId, competence } = request.query;
        const my_id = request.user_id

        const service = new ControlContabilService();
        const control = await service.create({
            my_id,
            clientId: clientId as string,
            competence: competence as string,
        });

        return response.json(control);
    }
    public detail = async (request: Request, response: Response) => {
        const { clientId, competence } = request.query;

        const service = new ControlContabilService();
        const control = await service.detail(clientId as string, competence as string);

        return response.json(control);
    }

    public updateField = async (request: Request, response: Response) => {
        const { id } = request.params;
        const my_id = request.user_id
        const data = request.body;

        const service = new ControlContabilService();
        const updatedControl = await service.updateField({ my_id, id, data });

        return response.json(updatedControl);
    }
}

export { ControlContabilController };