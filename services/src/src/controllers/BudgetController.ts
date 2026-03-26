import { Request, Response } from "express";
import { BudgetService } from "../services/BudgetService";

class BudgetController {
    public create = async (request: Request, response: Response) => {
        const { department_id, title, items } = request.body;

        const budgetService = new BudgetService();
        const newBudget = await budgetService.create({ department_id, title, items });

        return response.json(newBudget);
    }
    public list = async (request: Request, response: Response) => {
        const { department_id } = request.body;
        const budgetService = new BudgetService();
        const budgets = await budgetService.list(department_id);
        return response.json(budgets);
    }
    public details = async (request: Request, response: Response) => {
        const { id } = request.params;
        const budgetService = new BudgetService();
        const budget = await budgetService.detail(id);
        return response.json(budget);
    }
    public update = async (request: Request, response: Response) => {
        const { id } = request.params;
        const dataToUpdate = request.body;

        const budgetService = new BudgetService();

        const updatedBudget = await budgetService.update({
            id,
            data: dataToUpdate,
        });

        return response.json(updatedBudget);
    }

    public addItem = async (request: Request, response: Response) => {
        const { id } = request.params;
        const item = request.body;

        const budgetService = new BudgetService();
        const updatedBudget = await budgetService.addItem({ budgetId: id, item });
        
        return response.json(updatedBudget);
    }
    public removeItem = async (request: Request, response: Response) => {
        const { budgetId, itemId } = request.params;

        const budgetService = new BudgetService();
        const updatedBudget = await budgetService.removeItem({ budgetId, itemId });
        
        return response.json(updatedBudget);
    }
}

export { BudgetController };