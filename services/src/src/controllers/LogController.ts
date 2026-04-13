import { Request, Response } from "express"
import { LogService } from "../services/LogService"

interface listLog {
    referring: string
    referringId: string
    dep: string
}

class LogController {
    public list = async (request: Request, response: Response): Promise<void> => {
        let { referring, referringId, dep } = request.query as Partial<listLog>

        const service = new LogService()
        const list = await service.list(referring!, referringId!, dep!)

        response.json(list)
    }
}

export { LogController }