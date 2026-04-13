import { Request, Response } from "express";
import { SitePasswordRegularizeService } from "../../services/regularize/SitePasswordRegularizeService";

class SitePasswordRegularizeController {
    public create = async (request: Request, response: Response) => {
        const { name, sphere, link, user, password } = request.body;
        const my_id = request.user_id

        const service = new SitePasswordRegularizeService();
        const create = await service.create({ my_id, name, sphere, link, user, password });

        return response.json(create);
    }
    public update = async (request: Request, response: Response) => {
        const { id, name, sphere, link, user, password, status } = request.body;
        const my_id = request.user_id

        const service = new SitePasswordRegularizeService();
        const updated = await service.update({ my_id, id, name, sphere, link, user, password, status });

        return response.json(updated);
    }
    public detail = async (request: Request, response: Response) => {
        let { id } = request.body;
        if (id === undefined)
            id = request.query.id;

        const service = new SitePasswordRegularizeService();
        const detail = await service.detail(id);

        return response.json(detail);
    }
    public list = async (request: Request, response: Response) => {
        let { status } = request.body;

        const service = new SitePasswordRegularizeService();
        const list = await service.list(status);
        return response.json(list);
    }

}

export { SitePasswordRegularizeController };