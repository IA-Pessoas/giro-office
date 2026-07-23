import { Request, Response } from "express";
import { PasswordService } from "../../services/regularize/PasswordService";

class PasswordController {
    public create = async (request: Request, response: Response) => {
        const { client_id, site_id, login, password, notes } = request.body
        const my_id = request.user_id

        const service = new PasswordService();
        const result = await service.create({ my_id, client_id, site_id, login, password, notes })
        
        return response.status(201).json(result);
    }

    public update = async (request: Request, response: Response) => {
        const { id, client_id, site_id, login, password, notes } = request.body;
        const my_id = request.user_id

        if (!id) 
            throw new Error("O ID é obrigatório para atualizar.");

        const service = new PasswordService();
        const result = await service.update({ my_id, id, client_id, site_id, login, password, notes });

        return response.json(result);
    }

    public list = async (request: Request, response: Response) => {
        const { client_id } = request.body;

        const service = new PasswordService();
        const result = await service.list(client_id);
        return response.json(result);
    }

    public detail = async (request: Request, response: Response) => {
        const { id } = request.query;
        if (!id)
            throw new Error("O ID é obrigatório para ver os detalhes.");

        const service = new PasswordService();
        const result = await service.detail(id as string);

        return response.json(result);
    }
}

export { PasswordController };