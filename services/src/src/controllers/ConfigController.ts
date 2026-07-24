import { Request, Response } from "express"
import { ConfigService } from "../services/ConfigService"

class ConfigController {
    public createCommercialProposal = async (request: Request, response: Response): Promise<void> => {
        const { name, minimum_wage } = request.body
        const my_id = request.user_id
      
        const cs = new ConfigService()

        const create = await cs.createCommercialProposal(my_id, name, minimum_wage)

        response.json(create)
    }

    public detailCommercialProposal = async (request: Request, response: Response): Promise<void> => {
        let { config_id } = request.body
        if (config_id === undefined)
            config_id = request.query.config_id

        const cs = new ConfigService()

        const detail = await cs.detailCommercialProposal(config_id)

        response.json(detail)
    }

    public updateCommercialProposal = async (request: Request, response: Response): Promise<void> => {
        const { config_id, name, minimum_wage } = request.body
        const my_id = request.user_id

        const cs = new ConfigService()
        const update = await cs.updateCommercialProposal(my_id, config_id, name, minimum_wage)

        response.json(update)
    }

    public list = async (request: Request, response: Response): Promise<void> => {
        const cs = new ConfigService()
        const list = await cs.list()

        response.json(list)
    }
}

export { ConfigController }