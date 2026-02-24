import { Router } from "express";
import { isAuthenticated } from "../middlewares/isAuthenticated";
import { BudgetController } from "../controllers/BudgetController";

const budgetRouter = Router();
const budgetController = new BudgetController();

// Rota para criar um novo orçamento
budgetRouter.post(
    '/budgets', 
    isAuthenticated.bind(isAuthenticated), 
    budgetController.create.bind(BudgetController)
);

// Rota para ATUALIZAR os dados de um orçamento (título, status, etc.)
budgetRouter.patch(
    '/budgets/:id',
    isAuthenticated.bind(isAuthenticated),
    budgetController.update.bind(BudgetController)
);

// Rota para listar os orçamentos do usuário logado
budgetRouter.get(
    '/budgets', 
    isAuthenticated.bind(isAuthenticated), 
    budgetController.list.bind(BudgetController)
);

// Rota para ver detalhes de um orçamento
budgetRouter.get(
    '/budgets/:id', 
    isAuthenticated.bind(isAuthenticated), 
    budgetController.details.bind(BudgetController)
);

// Rota para adicionar um novo item a um orçamento existente
budgetRouter.post(
    '/budgets/:id/items', 
    isAuthenticated.bind(isAuthenticated), 
    budgetController.addItem.bind(BudgetController)
);

// Rota para remover item do orçamento
budgetRouter.delete(
    '/budgets/:budgetId/items/:itemId', 
    isAuthenticated.bind(isAuthenticated), 
    budgetController.removeItem.bind(BudgetController)
);

export default budgetRouter;