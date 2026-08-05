import { Request, Response } from "express";
import { ColaboratorService } from "../../services/rh/ColaboratorService";
import { EmergencyContactService } from "../../services/rh/EmergencyContactService";
import { AllergyService } from "../../services/rh/AllergyService";

class RhProfileController {

    // --- COLABORATORS (DADOS PESSOAIS) ---
    public upsertColaborator = async (req: Request, res: Response) => {
        const service = new ColaboratorService();
        // Se target_user_id vier no body, usa ele. Se não, usa o ID do token.
        const target_user_id = req.body.target_user_id || req.user_id;

        const result = await service.upsert({
            ...req.body,
            my_id: req.user_id,
            target_user_id
        });
        return res.json(result);
    }

    public detailColaborator = async (req: Request, res: Response) => {
        const service = new ColaboratorService();
        const target_user_id = (req.query.user_id as string) || req.user_id;
        
        const result = await service.detail(target_user_id);
        return res.json(result);
    }

    // --- EMERGENCY CONTACTS ---
    public createContact = async (req: Request, res: Response) => {
        const service = new EmergencyContactService();
        const target_user_id = req.body.target_user_id || req.user_id;

        const result = await service.create({
            ...req.body,
            my_id: req.user_id,
            target_user_id
        });
        return res.json(result);
    }

    public listContacts = async (req: Request, res: Response) => {
        const service = new EmergencyContactService();
        const target_user_id = (req.query.user_id as string) || req.user_id;

        const result = await service.list(target_user_id);
        return res.json(result);
    }

    public deleteContact = async (req: Request, res: Response) => {
        const service = new EmergencyContactService();
        const { id } = req.body;
        const result = await service.delete(req.user_id, id);
        return res.json(result);
    }

    // --- ALLERGIES ---
    public createAllergy = async (req: Request, res: Response) => {
        const service = new AllergyService();
        const target_user_id = req.body.target_user_id || req.user_id;

        const result = await service.create({
            ...req.body,
            my_id: req.user_id,
            target_user_id
        });
        return res.json(result);
    }

    public listAllergies = async (req: Request, res: Response) => {
        const service = new AllergyService();
        const target_user_id = (req.query.user_id as string) || req.user_id;

        const result = await service.list(target_user_id);
        return res.json(result);
    }

    public deleteAllergy = async (req: Request, res: Response) => {
        const service = new AllergyService();
        const { id } = req.body;
        const result = await service.delete(req.user_id, id);
        return res.json(result);
    }
}

export { RhProfileController };