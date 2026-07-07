import prismaClient from "../../prisma";

class RhCategoryService {
    async create(name: string) {
        return await prismaClient.rhCategory.create({
            data: { name, active: true }
        });
    }

    async list() {
        return await prismaClient.rhCategory.findMany({
            where: { active: true },
            orderBy: { name: 'asc' }
        });
    }
    
}
export { RhCategoryService };