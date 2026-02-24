import { Request, Response } from "express";
import { ProceduralGuidanceService } from "../../services/regularize/ProceduralGuidanceService";

class ProceduralGuidanceController {
    
    public create = async (req: Request, res: Response) => {
        const service = new ProceduralGuidanceService();
        const result = await service.create({ ...req.body, my_id: req.user_id });
        return res.json(result);
    }

    public update = async (req: Request, res: Response) => {
        const { id, ...data } = req.body; // ID vem no body
        const service = new ProceduralGuidanceService();
        const result = await service.update({ id, ...data, my_id: req.user_id });
        return res.json(result);
    }

    public detail = async (req: Request, res: Response) => {
        const { id } = req.query;
        const service = new ProceduralGuidanceService();
        const result = await service.detail(id as string);
        return res.json(result);
    }

    public listByProcess = async (req: Request, res: Response) => {
        const { process_id } = req.query;
        const service = new ProceduralGuidanceService();
        const result = await service.listByProcess(process_id as string);
        return res.json(result);
    }

    // Manipulação de Atividades Econômicas
    public addActivity = async (req: Request, res: Response) => {
        const { guidance_id, activity } = req.body;
        const service = new ProceduralGuidanceService();
        const result = await service.addEconomicActivity(req.user_id, guidance_id, activity);
        return res.json(result);
    }

    public removeActivity = async (req: Request, res: Response) => {
        const { guidance_id, item_id } = req.body;
        const service = new ProceduralGuidanceService();
        const result = await service.removeEconomicActivity(req.user_id, guidance_id, item_id);
        return res.json(result);
    }

    // Manipulação de Sócios
    public addPartner = async (req: Request, res: Response) => {
        const { guidance_id, partner } = req.body;
        const service = new ProceduralGuidanceService();
        const result = await service.addPartner(req.user_id, guidance_id, partner);
        return res.json(result);
    }

    public removePartner = async (req: Request, res: Response) => {
        const { guidance_id, item_id } = req.body;
        const service = new ProceduralGuidanceService();
        const result = await service.removePartner(req.user_id, guidance_id, item_id);
        return res.json(result);
    }
}

export { ProceduralGuidanceController };