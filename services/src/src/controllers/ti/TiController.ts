import { Request, Response } from "express";
import { TiHelpdeskService } from "../../services/ti/TiHelpdeskService";
import { TiAccessService } from "../../services/ti/TiAccessService";
import { TiInventoryService } from "../../services/ti/TiInventoryService";
import { TiTermService } from "../../services/ti/TiTermService";

class TiController {
    // --- HELPDESK ---
    public createHelpdeskCategory = async (req: Request, res: Response) => {
        const service = new TiHelpdeskService();
        const result = await service.createCategory(req.body.name);
        return res.json(result);
    }
    public createRequest = async (req: Request, res: Response) => {
        const service = new TiHelpdeskService();
        const result = await service.createRequest({ ...req.body, my_id: req.user_id });
        return res.json(result);
    }
    public listRequests = async (req: Request, res: Response) => {
        const service = new TiHelpdeskService();
        const { status, view } = req.query;
        let filters: any = {};
        if (status) filters.status = String(status);
        if (view === 'me') filters.requester_id = req.user_id;
        const result = await service.listRequests(filters);
        return res.json(result);
    }
    public detailRequest = async (req: Request, res: Response) => {
        const service = new TiHelpdeskService();
        const result = await service.detailRequest(req.query.id as string);
        return res.json(result);
    }
    public sendMessage = async (req: Request, res: Response) => {
        const service = new TiHelpdeskService();
        const result = await service.sendMessage({ ...req.body, my_id: req.user_id });
        return res.json(result);
    }

    // --- ACESSOS (SENHAS / RAMAIS) ---
    public createPassword = async (req: Request, res: Response) => {
        const service = new TiAccessService();
        const result = await service.createPassword({ ...req.body, my_id: req.user_id });
        return res.json(result);
    }
    public updatePassword = async (req: Request, res: Response) => {
        const service = new TiAccessService();
        // ID vem no body junto com os dados novos
        const result = await service.updatePassword({ ...req.body, my_id: req.user_id });
        return res.json(result);
    }
    public deletePassword = async (req: Request, res: Response) => {
        const service = new TiAccessService();
        const { id } = req.body;
        const result = await service.deletePassword(req.user_id, id);
        return res.json(result);
    }
    public listPasswords = async (req: Request, res: Response) => {
        const service = new TiAccessService();
        const { user_id } = req.query;

        const result = await service.listPasswords(user_id ? String(user_id) : undefined);
        return res.json(result);
    }
    public detailPassword = async (req: Request, res: Response) => {
        const service = new TiAccessService();
        const result = await service.detailPassword(req.query.id as string);
        return res.json(result);
    }
    public createExtension = async (req: Request, res: Response) => {
        const service = new TiAccessService();
        const result = await service.createExtension({ ...req.body, my_id: req.user_id });
        return res.json(result);
    }
    public updateExtension = async (req: Request, res: Response) => {
        const service = new TiAccessService();
        const result = await service.updateExtension({ ...req.body, my_id: req.user_id });
        return res.json(result);
    }
    public listExtensions = async (req: Request, res: Response) => {
        const service = new TiAccessService();
        const result = await service.listExtensions();
        return res.json(result);
    }
    public deleteExtension = async (req: Request, res: Response) => {
        const service = new TiAccessService();
        const { id } = req.body;
        const result = await service.deleteExtension(req.user_id, id);
        return res.json(result);
    }

    // --- INVENTÁRIO ---
    public createInventoryCategory = async (req: Request, res: Response) => {
        const service = new TiInventoryService();
        const result = await service.createCategory(req.body.name, req.body.tag);
        return res.json(result);
    }
    public updateInventoryCategory = async (req: Request, res: Response) => {
        const service = new TiInventoryService();
        const { id, name, tag } = req.body;
        const result = await service.updateCategory(req.user_id, id, name, tag);
        return res.json(result);
    }
    public listInventoryCategories = async (req: Request, res: Response) => {
        const service = new TiInventoryService();
        const { status } = req.body;
        const result = await service.listCategories(status);
        return res.json(result);
    }
    public deleteInventoryCategory = async (req: Request, res: Response) => {
        const service = new TiInventoryService();
        const { id } = req.body;
        const result = await service.deleteCategory(req.user_id, id);
        return res.json(result);
    }

    public createInventoryLocation = async (req: Request, res: Response) => {
        const service = new TiInventoryService();
        const result = await service.createLocation(req.body.name);
        return res.json(result);
    }
    public updateInventoryLocation = async (req: Request, res: Response) => {
        const service = new TiInventoryService();
        const { id, name } = req.body;
        const result = await service.updateLocation(req.user_id, id, name);
        return res.json(result);
    }
    public listInventoryLocation = async (req: Request, res: Response) => {
        const service = new TiInventoryService();
        const { status } = req.body;
        const result = await service.listLocations(status);
        return res.json(result);
    }
    public deleteInventoryLocation = async (req: Request, res: Response) => {
        const service = new TiInventoryService();
        const { id } = req.body;
        const result = await service.deleteLocation(req.user_id, id);
        return res.json(result);
    }

    public createAsset = async (req: Request, res: Response) => {
        const service = new TiInventoryService();
        const result = await service.createItem(req.body, req.user_id);
        return res.json(result);
    }
    public updateAsset = async (req: Request, res: Response) => {
        const service = new TiInventoryService();
        const result = await service.updateItem(req.user_id, req.body);
        return res.json(result);
    }
    public deleteAsset = async (req: Request, res: Response) => {
        const service = new TiInventoryService();
        const { id } = req.body;
        const result = await service.deleteItem(req.user_id, id);
        return res.json(result);
    }
    public listAssets = async (req: Request, res: Response) => {
        const service = new TiInventoryService();
        const result = await service.listItems();
        return res.json(result);
    }

    // --- TERMOS ---
    public createTerm = async (req: Request, res: Response) => {
        const service = new TiTermService();
        const result = await service.create(req.body);
        return res.json(result);
    }
    public listTerms = async (req: Request, res: Response) => {
        const service = new TiTermService();
        const result = await service.list();
        return res.json(result);
    }
    public updateTerm = async (req: Request, res: Response) => {
        const service = new TiTermService();
        const result = await service.update(req.user_id, req.body);
        return res.json(result);
    }
    public deleteTerm = async (req: Request, res: Response) => {
        const service = new TiTermService();
        const { id } = req.body;
        const result = await service.delete(req.user_id, id);
        return res.json(result);
    }
}
export { TiController };