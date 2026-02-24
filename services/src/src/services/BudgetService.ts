import { PrismaClient, Prisma } from "@prisma/client";
import { randomUUID } from "crypto";

interface BudgetItem {
    itemId?: string;
    description: string;
    quantity: number;
    unit_price: number;
    total_amount: number;
    shipping_cost?: number;
    destination?: string;  
    purpose: string;
    requester_id: string;
    department_id: string;
    vendor_name?: string;   
    vendor_cnpj?: string;   
    vendor_contact_info?: string;
    notes?: string;
    payment_terms?: string; 
    payment_type?: string;  
    is_in_installments?: boolean;
    status: 'pending' | 'approved' | 'rejected' | 'purchased'; // Status do item
}

interface CreateBudgetDTO {
    department_id: string;
    title: string;
    items: BudgetItem[];
}
interface UpdateBudgetDTO {
    id: string;
    data: {
        title?: string;
        status?: string;
    };
}


interface AddItemDTO {
    budgetId: string;
    item: Omit<BudgetItem, 'itemId'>
}

class BudgetService {
    private prisma = new PrismaClient();

    public async create({ department_id, title, items }: CreateBudgetDTO) {
        if (!title || items.length === 0) {
            throw new Error("Título e ao menos um item são obrigatórios.");
        }

        const itemsWithId = items.map(item => ({
            ...item,
            itemId: randomUUID(), // Adiciona um ID único a cada item inicial
        }));

        const budget = await this.prisma.budget.create({
            data: {
                title,
                status: 'pending', // Status inicial do orçamento geral
                department_id,
                items: itemsWithId , // Prisma pode salvar o array de JSON diretamente
            },
        });

        return budget;
    }
    public async list(department_id: string) {
        const budgets = await this.prisma.budget.findMany({
            where: { department_id },
            orderBy: { createdAt: 'desc' },
        });
        return budgets;
    }
    public async detail(id: string) {
        const budget = await this.prisma.budget.findUnique({
            where: { id },
        });
        if (!budget) {
            throw new Error("Orçamento não encontrado.");
        }
        return budget;
    }
    /**
     * Atualiza os dados de um orçamento (ex: título, status).
     * @param {UpdateBudgetDTO} dto - Contém o ID do orçamento, ID do usuário e os dados a serem atualizados.
     * @returns O orçamento com os dados atualizados.
     */
    public async update({ id, data }: UpdateBudgetDTO) {
        // 1. Verifica se o orçamento existe E se pertence ao usuário que fez a requisição.
        //    Isso previne que um usuário modifique o orçamento de outro.
        const budgetExists = await this.prisma.budget.findFirst({
            where: {
                id: id,
            },
        });

        // 2. Se não encontrar, lança um erro.
        if (!budgetExists) {
            throw new Error("Orçamento não encontrado ou você не tem permissão para editá-lo.");
        }

        // 3. Se encontrou, aplica a atualização no banco de dados.
        const updatedBudget = await this.prisma.budget.update({
            where: {
                id: id,
            },
            data: {
                title: data.title,
                status: data.status,
            },
        });

        // 4. Retorna o orçamento atualizado.
        return updatedBudget;
    }

    /**
     * Adiciona um novo item a um orçamento já existente.
     * @param {string} budgetId - O ID do orçamento que receberá o novo item.
     * @param {object} item - O objeto do novo item a ser adicionado.
     * @returns O orçamento atualizado com o novo item na lista.
     */
    public async addItem({ budgetId, item }: AddItemDTO) {
        // 1. Encontra o orçamento no banco de dados para garantir que ele existe
        const budget = await this.prisma.budget.findUnique({
            where: { id: budgetId },
        });

        // 2. Valida se o orçamento foi encontrado. Se não, lança um erro.
        if (!budget) {
            throw new Error("Orçamento não encontrado.");
        }

        // 3. Prepara o novo item, adicionando um ID único a ele.
        //    Isso é crucial para que depois possamos remover ou editar este item especificamente.
        const newItemWithId: BudgetItem = {
            ...item,
            itemId: randomUUID(), 
        };

        // 4. Pega a lista de itens que já existe no orçamento.
        //    O "as BudgetItem[]" ajuda o TypeScript a entender o tipo do dado.
        //    O "|| []" garante que, se o campo for nulo, começamos com um array vazio.
        const currentItems = (budget.items as unknown as BudgetItem[]) || [];
        
        // 5. Adiciona o novo item (já com seu ID) à lista de itens existentes.
        currentItems.push(newItemWithId);

        // 6. Atualiza o registro do orçamento no banco de dados,
        //    substituindo o campo 'items' pela nossa lista atualizada.
        const updatedBudget = await this.prisma.budget.update({
            where: { id: budgetId },
            data: {
                items: currentItems as unknown as Prisma.JsonArray,
            },
        });

        // 7. Retorna o documento completo do orçamento já com o item adicionado.
        return updatedBudget;
    }
    /**
     * Remove um item específico de um orçamento.
     * @param {string} budgetId - O ID do orçamento a ser modificado.
     * @param {string} itemId - O ID único do item a ser removido.
     * @returns O orçamento atualizado sem o item.
     */
    public async removeItem({ budgetId, itemId }: { budgetId: string; itemId: string }) {
        // 1. Encontra o orçamento no banco de dados
        const budget = await this.prisma.budget.findUnique({
            where: { id: budgetId },
        });

        // 2. Valida se o orçamento existe
        if (!budget) {
            throw new Error("Orçamento não encontrado.");
        }

        // 3. Pega a lista atual de itens, garantindo que seja um array
        const currentItems = (budget.items as any[]) || [];
        
        // 4. Cria uma nova lista, filtrando para remover o item com o itemId correspondente
        const updatedItems = currentItems.filter(item => item.itemId !== itemId);
        
        // 5. Valida se o item foi realmente encontrado e removido
        if (currentItems.length === updatedItems.length) {
            throw new Error("Item com o ID especificado não foi encontrado neste orçamento.");
        }

        // 6. Atualiza o orçamento no banco com a nova lista de itens
        const updatedBudget = await this.prisma.budget.update({
            where: { id: budgetId },
            data: {
                items: updatedItems,
            },
        });

        // 7. Retorna o orçamento com a lista de itens atualizada
        return updatedBudget;
    }
}

export { BudgetService };