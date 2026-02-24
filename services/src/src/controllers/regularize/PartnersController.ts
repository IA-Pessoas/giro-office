import { Request, Response } from "express";
import { PartnersService } from "../../services/regularize/PartnersService";

class PartnersController {
    public create = async (request: Request, response: Response) => {
        const { pj_id, pf_id, part, entry, exit } = request.body;
        const my_id = request.user_id

        const service = new PartnersService();
        const create = await service.create({ my_id, pj_id, pf_id, part, entry, exit });

        return response.json(create);
    }
    public update = async (request: Request, response: Response) => {
        const { id, pj_id, pf_id, part, entry, exit } = request.body;
        const my_id = request.user_id

        const service = new PartnersService();
        const updated = await service.update({ my_id, id, pj_id, pf_id, part, entry, exit });

        return response.json(updated);
    }
    public detail = async (request: Request, response: Response) => {
        let { id } = request.body;
        if (id === undefined)
            id = request.query.id;

        const service = new PartnersService();
        const detail = await service.detail(id);

        return response.json(detail);
    }
    public list = async (request: Request, response: Response) => {
        let { type, client_id } = request.body;

        const service = new PartnersService();
        const list = await service.list(type, client_id);
        return response.json(list);
    }

}

export { PartnersController };