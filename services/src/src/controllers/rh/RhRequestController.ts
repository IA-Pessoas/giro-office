import { Request, Response } from "express";
import { RhRequestService } from "../../services/rh/RhRequestService";
import { RhCategoryService } from "../../services/rh/RhCategoryService";

class RhRequestController {

    // --- CATEGORIAS ---
    public createCategory = async (req: Request, res: Response) => {
        const service = new RhCategoryService();
        const result = await service.create(req.body.name);
        return res.json(result);
    }

    public listCategories = async (req: Request, res: Response) => {
        const service = new RhCategoryService();
        const result = await service.list();
        return res.json(result);
    }

    // --- CHAMADOS ---
    public create = async (req: Request, res: Response) => {
        const service = new RhRequestService();
        const result = await service.create({ ...req.body, my_id: req.user_id });
        return res.json(result);
    }

    public list = async (req: Request, res: Response) => {
        const service = new RhRequestService();
        const { status, view } = req.query;
        
        let filters: any = {};
        if (status) filters.status = String(status);
        
        // Se view='me', lista só os meus. Se for RH, lista tudo ou os atribuidos.
        // Aqui você pode adicionar lógica de permissão.
        // Exemplo simplificado:
        if (view === 'me') {
            filters.requester_id = req.user_id;
        } else if (view === 'assigned') {
            filters.assigned_to_id = req.user_id;
        }

        const result = await service.list(filters);
        return res.json(result);
    }

    public detail = async (req: Request, res: Response) => {
        const service = new RhRequestService();
        const { id } = req.query;
        const result = await service.detail(id as string);
        return res.json(result);
    }

    public assign = async (req: Request, res: Response) => {
        const service = new RhRequestService();
        const { id } = req.body; // ID do chamado
        const result = await service.assignToMe(req.user_id, id);
        return res.json(result);
    }

    public sendMessage = async (req: Request, res: Response) => {
        const service = new RhRequestService();
        const result = await service.sendMessage({
            ...req.body,
            my_id: req.user_id
        });
        return res.json(result);
    }
}

export { RhRequestController };