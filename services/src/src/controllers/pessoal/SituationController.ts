import { Request, Response } from "express";
import { SituationService } from "../../services/pessoal/SituationService";

class SituationController {
    public create = async (request: Request, response: Response) => {
        const { client_id, title, description } = request.body;
        const my_id = request.user_id;

        const service = new SituationService();
        const result = await service.create({ my_id, client_id, title, description });

        return response.status(201).json(result);
    }

    public update = async (request: Request, response: Response) => {
        const { id, status, title, description } = request.body;
        const my_id = request.user_id

        if (!id) throw new Error("O ID é obrigatório para atualizar.");

        const service = new SituationService();
        const result = await service.update({ my_id, id, status, title, description });

        return response.json(result);
    }

    public list = async (request: Request, response: Response) => {
        const { clientId } = request.query;

        if (!clientId) throw new Error("O 'clientId' é obrigatório.");

        const service = new SituationService();
        const result = await service.list(clientId as string);

        return response.json(result);
    }

    public detail = async (request: Request, response: Response) => {
        const { id } = request.query;

        if (!id) throw new Error("O 'id' é obrigatório para ver os detalhes.");

        const service = new SituationService();
        const result = await service.detail(id as string);

        return response.json(result);
    }
}

export { SituationController };