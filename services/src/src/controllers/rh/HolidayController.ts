import { Request, Response } from "express";
import { HolidayService } from "../../services/rh/HolidayService";

class HolidayController {

    public create = async (req: Request, res: Response) => {
        const service = new HolidayService();
        const result = await service.create({ ...req.body, my_id: req.user_id });
        return res.json(result);
    }

    public update = async (req: Request, res: Response) => {
        const service = new HolidayService();
        const result = await service.update({ ...req.body, my_id: req.user_id });
        return res.json(result);
    }

    public list = async (req: Request, res: Response) => {
        const service = new HolidayService();
        const result = await service.list();
        return res.json(result);
    }

    public delete = async (req: Request, res: Response) => {
        const service = new HolidayService();
        const { id } = req.body;
        const result = await service.delete(req.user_id, id);
        return res.json(result);
    }
}

export { HolidayController };