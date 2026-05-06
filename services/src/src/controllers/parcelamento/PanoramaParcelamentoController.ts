import { Request, Response } from "express";
import { PanoramaParcelamentoService } from "../../services/parcelamento/PanoramaParcelamentoService";

class PanoramaParcelamentoController {
    public create = async (request: Request, response: Response) => {
        const { clientId, competence } = request.body;
        const my_id = request.user_id

        const service = new PanoramaParcelamentoService();
        const control = await service.create({
            my_id,
            clientId: clientId as string,
            competence: competence as string,
        });

        return response.json(control);
    }
    public detail = async (request: Request, response: Response) => {
        const { clientId, competence } = request.query;

        const service = new PanoramaParcelamentoService();
        const control = await service.detail(clientId as string, competence as string);

        return response.json(control);
    }

    public updateField = async (request: Request, response: Response) => {
        const { id } = request.params;
        const my_id = request.user_id
        const data = request.body;

        const service = new PanoramaParcelamentoService();
        const updatedControl = await service.updateField({ my_id, id, data });

        return response.json(updatedControl);
    }

    public comp = async (request: Request, response: Response) => {
        const { competence } = request.body;
        const my_id = request.user_id

        const service = new PanoramaParcelamentoService();
        const res = await service.comp(my_id, competence as string);

        return response.json(res);
    }
}

export { PanoramaParcelamentoController };