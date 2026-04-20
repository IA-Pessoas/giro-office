import { Request, Response } from "express";
import { RelationshipContabilService } from "../../services/contabil/RelationshipContabilService";

class RelationshipContabilController {
    private service = new RelationshipContabilService();

    public create = async (request: Request, response: Response) => {
        const data = request.body;
        const my_id = request.user_id

        const relationship = await this.service.create(my_id, data);
        return response.status(201).json(relationship);
    }

    public update = async (request: Request, response: Response) => {
        const { id } = request.params;
        const data = request.body;
        const my_id = request.user_id

        const relationship = await this.service.update(my_id, id, data);
        return response.json(relationship);
    }

    public getByClientId = async (request: Request, response: Response) => {
        const { clientId } = request.params;
        const relationship = await this.service.getByClientId(clientId);
        return response.json(relationship);
    }

    public delete = async (request: Request, response: Response) => {
        const { id } = request.params;
        const result = await this.service.delete(id);
        return response.json(result);
    }
}

export { RelationshipContabilController };