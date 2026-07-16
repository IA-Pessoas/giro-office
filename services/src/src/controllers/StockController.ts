import { Request, Response } from "express"
import { StockService } from "../services/StockService"

class StockController {
    public create = async (request: Request, response: Response): Promise<void> => {
        const { department_id, name, category_id, location_id, quantity, description } = request.body
        const my_id = request.user_id

        const ss = new StockService()

        const create = await ss.create({ 
            my_id, 
            department_id, 
            name, 
            category_id, 
            location_id, 
            quantity, 
            description 
        })

        response.json(create)
    }
    public details = async (request: Request, response: Response): Promise<void> => {
        let { stock_id } = request.body
        if (stock_id === undefined)
            stock_id = request.query.stock_id

        const ss = new StockService()

        const detail = await ss.detail(stock_id)

        response.json(detail)
    }
    public update = async (request: Request, response: Response): Promise<void> => {
        const { stock_id, name, category_id, location_id, description, status } = request.body
        const my_id = request.user_id

        const ss = new StockService()
        const update = await ss.update({
            my_id,
            stock_id, 
            name, 
            category_id, 
            location_id, 
            description, 
            status
        })

        response.json(update)
    }
    public list = async (request: Request, response: Response): Promise<void> => {
        let { status, department_id } = request.body
        if (status === undefined || department_id === undefined) {
            status = request.query.status 
            department_id = request.query.department_id
        }

        const ss = new StockService()
        const list = await ss.list(status, department_id)

        response.json(list)
    }

    public entry = async (request: Request, response: Response): Promise<void> => {
        const { stock_id, quantity, entry_date } = request.body
        const my_id = request.user_id

        const ss = new StockService()

        const entry = await ss.entry({ my_id, stock_id, quantity, entry_date })

        response.json(entry)
    }
    public exit = async (request: Request, response: Response): Promise<void> => {
        const { stock_id, quantity, destination, exit_date, requester_id, approver_id, location_destination_id } = request.body
        const my_id = request.user_id

        const ss = new StockService()

        const exit = await ss.exit({ my_id, stock_id, quantity, destination, exit_date, requester_id, approver_id, location_destination_id })

        response.json(exit)
    }

    public createLocation = async (request: Request, response: Response): Promise<void> => {
        const { name, floor, department_id } = request.body
        const my_id = request.user_id

        const ss = new StockService()

        const create = await ss.createLocation({ my_id, name, floor, department_id })

        response.json(create)
    }
    public detailsLocation = async (request: Request, response: Response): Promise<void> => {
        let { location_id } = request.body
        if (location_id === undefined)
            location_id = request.query.location_id

        const ss = new StockService()

        const detail = await ss.detailLocation(location_id)

        response.json(detail)
    }
    public updateLocation = async (request: Request, response: Response): Promise<void> => {
        const { location_id, name, floor, status } = request.body
        const my_id = request.user_id

        const ss = new StockService()
        const update = await ss.updateLocation({ my_id, location_id, name, floor, status })

        response.json(update)
    }
    public listLocation = async (request: Request, response: Response): Promise<void> => {
        let { status, department_id } = request.body
        if (status === undefined || department_id === undefined) {
            status = request.query.status 
            department_id = request.query.department_id
        }

        const ss = new StockService()
        const list = await ss.listLocation(status, department_id)

        response.json(list)
    }

    public createCategory = async (request: Request, response: Response): Promise<void> => {
        const { name, department_id } = request.body
        const my_id = request.user_id

        const ss = new StockService()

        const create = await ss.createCategory({ my_id, name, department_id })

        response.json(create)
    }
    public detailsCategory = async (request: Request, response: Response): Promise<void> => {
        let { category_id } = request.body
        if (category_id === undefined)
            category_id = request.query.category_id

        const ss = new StockService()

        const detail = await ss.detailLocation(category_id)

        response.json(detail)
    }
    public updateCategory = async (request: Request, response: Response): Promise<void> => {
        const { category_id, name, status } = request.body
        const my_id = request.user_id

        const ss = new StockService()
        const update = await ss.updateCategory({ my_id, category_id, name, status })

        response.json(update)
    }
    public listCategory = async (request: Request, response: Response): Promise<void> => {
        let { status, department_id } = request.body
        if (status === undefined || department_id === undefined) {
            status = request.query.status 
            department_id = request.query.department_id
        }

        const ss = new StockService()
        const list = await ss.listCategory(status, department_id)

        response.json(list)
    }
}

export { StockController }