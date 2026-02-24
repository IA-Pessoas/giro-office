import prismaClient from "../../prisma";
import { LogService } from "../LogService";

class TiInventoryService {
    
    // --- CATEGORIAS DO INVENTÁRIO ---
    async createCategory(name: string, tag?: string) {
        return await prismaClient.inventoryCategoryTecnologia.create({ data: { name, tag } });
    }
    async listCategories(status: boolean) {
        return await prismaClient.inventoryCategoryTecnologia.findMany({ where: { active: status } });
    }
    async updateCategory(my_id: string, id: string, name: string, tag?: string) {
        const exists = await prismaClient.inventoryCategoryTecnologia.findUnique({ where: { id } });
        if (!exists) throw new Error("Categoria não encontrada");

        const updated = await prismaClient.inventoryCategoryTecnologia.update({
            where: { id },
            data: { name, tag }
        });

        const ls = new LogService();
        await ls.logUpdateIfChanged({
            my_id, action: "Atualizar Categoria TI", referring: "ti.inventory_category", referring_id: id, oldData: exists, updatedData: updated, dep: "ti"
        });
        return updated;
    }
    async deleteCategory(my_id: string, id: string) {
        // Opcional: Verificar se tem itens vinculados antes de deletar
        await prismaClient.inventoryCategoryTecnologia.delete({ where: { id } });
        
        const ls = new LogService();
        await ls.createLog({ my_id, action: "Excluir Categoria TI", referring: "ti.inventory_category", referring_id: id, changes: "Excluído", dep: "ti" });
        return { message: "Categoria excluída" };
    }

    // --- LOCAIS DO INVENTÁRIO ---
    async createLocation(name: string) {
        return await prismaClient.inventoryLocationTecnologia.create({ data: { name } });
    }
    async listLocations(status: boolean) {
        return await prismaClient.inventoryLocationTecnologia.findMany({ where: { active: status } });
    }
    async updateLocation(my_id: string, id: string, name: string) {
        const exists = await prismaClient.inventoryLocationTecnologia.findUnique({ where: { id } });
        if (!exists) throw new Error("Local não encontrado");

        const updated = await prismaClient.inventoryLocationTecnologia.update({
            where: { id },
            data: { name }
        });

        const ls = new LogService();
        await ls.logUpdateIfChanged({
            my_id, action: "Atualizar Local TI", referring: "ti.inventory_location", referring_id: id, oldData: exists, updatedData: updated, dep: "ti"
        });
        return updated;
    }
    async deleteLocation(my_id: string, id: string) {
        await prismaClient.inventoryLocationTecnologia.delete({ where: { id } });
        
        const ls = new LogService();
        await ls.createLog({ my_id, action: "Excluir Local TI", referring: "ti.inventory_location", referring_id: id, changes: "Excluído", dep: "ti" });
        return { message: "Local excluído" };
    }

    // --- INVENTÁRIO (EQUIPAMENTOS) ---
    async createItem(data: any, my_id: string) { // Data recebe o body completo
        const item = await prismaClient.inventoryTecnologia.create({
            data: {
                user_id: data.user_id,
                location_id: data.location_id,
                category_id: data.category_id,
                asset_code: data.asset_code,
                notes: data.notes,
                delivery_date: data.delivery_date ? new Date(data.delivery_date) : null,
                return_date: data.return_date ? new Date(data.return_date) : null,
                responsible_it_staff_id: data.responsible_it_staff_id
            }
        });
        
        const ls = new LogService();
        await ls.createLog({ my_id, action: "Cadastrar Ativo", referring: "ti.inventory", referring_id: item.id, changes: data.asset_code, dep: "ti" });
        return item;
    }
    async listItems() {
        return await prismaClient.inventoryTecnologia.findMany({
            include: {
                user: { select: { name: true } },
                location: true,
                category: true,
                responsible_it_staff: { select: { name: true } }
            }
        });
    }
    async updateItem(my_id: string, data: any) {
        const { id, ...updateData } = data;
        const exists = await prismaClient.inventoryTecnologia.findUnique({ where: { id } });
        if (!exists) throw new Error("Equipamento não encontrado");

        const updated = await prismaClient.inventoryTecnologia.update({
            where: { id },
            data: {
                user_id: updateData.user_id,
                location_id: updateData.location_id,
                category_id: updateData.category_id,
                asset_code: updateData.asset_code,
                notes: updateData.notes,
                delivery_date: updateData.delivery_date ? new Date(updateData.delivery_date) : null,
                return_date: updateData.return_date ? new Date(updateData.return_date) : null,
                responsible_it_staff_id: updateData.responsible_it_staff_id
            }
        });

        const ls = new LogService();
        await ls.logUpdateIfChanged({
            my_id, action: "Atualizar Ativo TI", referring: "ti.inventory", referring_id: id, oldData: exists, updatedData: updated, dep: "ti"
        });
        return updated;
    }

    async deleteItem(my_id: string, id: string) {
        await prismaClient.inventoryTecnologia.delete({ where: { id } });
        
        const ls = new LogService();
        await ls.createLog({ my_id, action: "Excluir Ativo TI", referring: "ti.inventory", referring_id: id, changes: "Excluído", dep: "ti" });
        return { message: "Equipamento excluído" };
    }
}
export { TiInventoryService };