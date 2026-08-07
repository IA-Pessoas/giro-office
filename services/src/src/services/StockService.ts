import prismaClient from "../prisma"
import { LogService } from './LogService';

interface CreateRequest {
    my_id: string
    department_id: string
    name: string
    category_id: string
    location_id: string
    quantity: number
    description?: string
}
interface UpdateRequest {
    my_id: string
    stock_id: string
    name: string
    category_id: string
    location_id: string
    description?: string
    status: boolean
}

interface CreateLocationRequest {
    my_id: string
    name: string
    floor: number
    department_id: string
}
interface UpdateLocationRequest {
    my_id: string
    location_id: string
    name: string
    floor: number
    status: boolean
}

interface CreateCategoryRequest {
    my_id: string
    name: string
    department_id: string
}
interface UpdateCategoryRequest {
    my_id: string
    category_id: string
    name: string
    status: boolean
}

interface EntryRequest {
    my_id: string
    stock_id: string
    quantity: number
    entry_date: Date
}
interface ExitRequest {
    my_id: string
    stock_id: string
    quantity: number
    destination?: string
    exit_date: Date
    requester_id: string
    approver_id?: string
    location_destination_id?: string
}

class StockService {
    async create({ my_id, department_id, name, category_id, location_id, quantity, description }: CreateRequest) {
        const exists = await prismaClient.stock.findFirst({
            where:{
                name,
                department_id
            }
        })
        if (exists) 
            throw new Error("Item já cadastrada")

        const create = await prismaClient.stock.create({
            data:{
                department_id,
                name,
                category_id,
                location_id,
                quantity,
                description,
                status: true
            },
            select:{
                id: true,
                department_id: true,
                name: true,
                category_id: true,
                location_id: true,
                quantity: true,
                description: true,
                status: true,
            }
        }) 

        const ls = new LogService()
        await ls.createLog({
            my_id,
            action: "Cadastro",
            referring: "stock",
            referring_id: create.id,
            changes: "{}"
        })

        return { create }
    }
    async detail(stock_id: string) {
        const detail = await prismaClient.stock.findFirst({
            where:{
                id: stock_id
            },
            select:{
                id: true,
                name: true,
                quantity: true,
                status: true,
            }
        })

        return { detail }
    }
    async update({ my_id, stock_id, name, category_id, location_id, description, status }: UpdateRequest) {
        try{
            const exists = await prismaClient.stock.findFirst({
                where:{
                    id: stock_id
                }
            })
            if (!exists) 
                throw new Error("Item não localizado")

            const updated = await prismaClient.stock.update({
                where:{
                    id: stock_id
                },
                data:{
                    name,
                    category_id,
                    location_id,
                    description,
                    status
                },
                select:{
                    name: true,
                    category_id: true,
                    location_id: true,
                    description: true,
                    status: true
                }
            })

            const ls = new LogService();
            await ls.logUpdateIfChanged({
                my_id,
                action: "Atualização",
                referring: "stock",
                referring_id: stock_id,
                oldData: exists,
                updatedData: updated,
            });

            return updated
        } catch (error) {
            console.log(error)
            throw new Error("Erro ao atualizar")
        }
    }
    async list(status: boolean, department_id: string) {
        const list = await prismaClient.categoryStock.findMany({
            where:{
                status,
                department_id
            },
            select:{
                id: true,
                name: true,
            },
            orderBy: {
                name: 'asc'
            }
        })

        return list
    }

    async entry({ my_id, stock_id, quantity, entry_date }: EntryRequest) {
        const exists = await prismaClient.stock.findFirst({
            where:{
                id: stock_id
            }
        })
        if (!exists) 
            throw new Error("Item não cadastrado")

        if (quantity <= 0)
            throw new Error("Quantidade inválida")

        const updated = await prismaClient.stock.update({
            where:{
                id: stock_id
            },
            data:{
                quantity: exists.quantity + quantity
            },
            select:{ 
                id: true,
                quantity: true,
            }
        })

        const entry = await prismaClient.entryStock.create({
            data:{
                stock_id,
                quantity,
                entry_date,
                entry_by_user_id: my_id
            },
            select:{
                id: true,
                stock_id: true,
                quantity: true,
                entry_date: true,
                entry_by_user_id: true,
            }
        })

        return { entry }
    }
    async exit({ my_id, stock_id, quantity, destination, exit_date, requester_id, approver_id, location_destination_id }: ExitRequest) {
        const exists = await prismaClient.stock.findFirst({
            where:{
                id: stock_id
            }
        })
        if (!exists) 
            throw new Error("Item não cadastrado")

        if (quantity <= 0 || quantity > exists.quantity || exists.quantity === 0)
            throw new Error("Quantidade inválida")

        const updated = await prismaClient.stock.update({
            where:{
                id: stock_id
            },
            data:{
                quantity: exists.quantity - quantity
            },
            select:{ 
                id: true,
                quantity: true,
            }
        })

        const exit = await prismaClient.exitStock.create({
            data:{
                stock_id,
                quantity,
                destination,
                exit_date,
                requester_id,
                approver_id,
                location_destination_id,
                operator_id: my_id
            },
            select:{
                id: true,
                stock_id: true,
                quantity: true,
            }
        })

        return { exit }
    }

    // Location
    async createLocation({ my_id, name, floor, department_id }: CreateLocationRequest) {
        const exists = await prismaClient.locationStock.findFirst({
            where:{
                name,
                department_id
            }
        })
        if (exists) 
            throw new Error("Localização já cadastrado")

        const create = await prismaClient.locationStock.create({
            data:{
                name, 
                floor,
                department_id,
                status: true
            },
            select:{
                id: true,
                name: true,
                floor: true,
                department_id: true,
                status: true,
            }
        }) 

        const ls = new LogService()
        await ls.createLog({
            my_id,
            action: "Cadastro",
            referring: "stock.locations",
            referring_id: create.id,
            changes: "{}"
        })

        return { create }
    }
    async detailLocation(location_id: string) {
        const detail = await prismaClient.locationStock.findFirst({
            where:{
                id: location_id
            },
            select:{
                id: true,
                name: true,
                floor: true,
                department_id: true,
                status: true,
            }
        })

        return { detail }
    }
    async updateLocation({ my_id, location_id, name, floor, status }: UpdateLocationRequest) {
        try{
            const exists = await prismaClient.locationStock.findFirst({
                where:{
                    id: location_id
                }
            })
            if (!exists) 
                throw new Error("Localização não localizada")

            const updated = await prismaClient.locationStock.update({
                where:{
                    id: location_id
                },
                data:{
                    name,
                    floor,
                    status,
                },
                select:{
                    name: true,
                    floor: true,
                    status: true,
                }
            })

            const ls = new LogService();
            await ls.logUpdateIfChanged({
                my_id,
                action: "Atualização",
                referring: "stock.locations",
                referring_id: location_id,
                oldData: exists,
                updatedData: updated,
            });

            return updated
        } catch (error) {
            console.log(error)
            throw new Error("Erro ao atualizar")
        }
    }
    async listLocation(status: boolean, department_id: string) {
        const list = await prismaClient.locationStock.findMany({
            where:{
                status,
                department_id
            },
            select:{
                id: true,
                name: true,
                floor: true,
            },
            orderBy: {
                name: 'asc'
            }
        })

        return list
    }

    // Category
    async createCategory({ my_id, name, department_id }: CreateCategoryRequest) {
        const exists = await prismaClient.categoryStock.findFirst({
            where:{
                name,
                department_id
            }
        })
        if (exists) 
            throw new Error("Categoria já cadastrada")

        const create = await prismaClient.categoryStock.create({
            data:{
                name, 
                department_id,
                status: true
            },
            select:{
                id: true,
                name: true,
                department_id: true,
                status: true,
            }
        }) 

        const ls = new LogService()
        await ls.createLog({
            my_id,
            action: "Cadastro",
            referring: "stock.categories",
            referring_id: create.id,
            changes: "{}"
        })

        return { create }
    }
    async detailCategory(category_id: string) {
        const detail = await prismaClient.categoryStock.findFirst({
            where:{
                id: category_id
            },
            select:{
                id: true,
                name: true,
                department_id: true,
                status: true,
            }
        })

        return { detail }
    }
    async updateCategory({ my_id, category_id, name, status }: UpdateCategoryRequest) {
        try{
            const exists = await prismaClient.categoryStock.findFirst({
                where:{
                    id: category_id
                }
            })
            if (!exists) 
                throw new Error("Categoria não localizada")

            const updated = await prismaClient.categoryStock.update({
                where:{
                    id: category_id
                },
                data:{
                    name,
                    status,
                },
                select:{
                    name: true,
                    status: true,
                }
            })

            const ls = new LogService();
            await ls.logUpdateIfChanged({
                my_id,
                action: "Atualização",
                referring: "stock.categories",
                referring_id: category_id,
                oldData: exists,
                updatedData: updated,
            });

            return updated
        } catch (error) {
            console.log(error)
            throw new Error("Erro ao atualizar")
        }
    }
    async listCategory(status: boolean, department_id: string) {
        const list = await prismaClient.categoryStock.findMany({
            where:{
                status,
                department_id
            },
            select:{
                id: true,
                name: true,
            },
            orderBy: {
                name: 'asc'
            }
        })

        return list
    }

}

export { StockService }