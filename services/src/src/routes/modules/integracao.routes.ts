import { Router } from "express"
import multer from "multer"
import { isAuthenticated } from "../../middlewares/isAuthenticated"
import { TaskController } from "../../controllers/integracao/Tasks/TaskController"
import { PlanController } from "../../controllers/integracao/Tasks/PlanController"
import { ProjectController } from "../../controllers/integracao/ProjectController"
import { PAController } from "../../controllers/integracao/PAController"
import { TaskIntegrationController } from "../../controllers/integracao/Tasks/TaskIntegrationController"

const taskController = new TaskController()
const planController = new PlanController()
const projectController = new ProjectController()
const paController = new PAController()
const taskIntegration = new TaskIntegrationController()

const router = Router()
const uploasd = multer({ storage: multer.memoryStorage() })

// Tarefas Modelo
router.post('/integracao-tasksModel', isAuthenticated.bind(isAuthenticated), taskController.createModel.bind(taskController))
router.get('/integracao-tasksModel', isAuthenticated.bind(isAuthenticated), taskController.listModel.bind(taskController))
router.put('/integracao-tasksModel', isAuthenticated.bind(isAuthenticated), taskController.updateModel.bind(taskController))
router.get('/integracao-taskModel', isAuthenticated.bind(isAuthenticated), taskController.detailModel.bind(taskController))
router.delete('/integracao-taskModel', isAuthenticated.bind(isAuthenticated), taskController.deletarModel.bind(taskController))
router.get('/integracao-depsTasks', isAuthenticated.bind(isAuthenticated), projectController.listDepTasks.bind(projectController))
router.post('/integracao-tasksModel-dependent', isAuthenticated.bind(isAuthenticated), taskController.addDependent.bind(taskController))
router.get('/integracao-tasksModel-dependent', isAuthenticated.bind(isAuthenticated), taskController.listDependent.bind(taskController))
router.delete('/integracao-taskModel-dependent', isAuthenticated.bind(isAuthenticated), taskController.deletarModel.bind(taskController))
// Tarefas Regularize
router.post('/integracao-tasksIntegration', isAuthenticated.bind(isAuthenticated), taskIntegration.create.bind(taskIntegration))
router.delete('/integracao-tasksIntegration', isAuthenticated.bind(isAuthenticated), taskIntegration.remove.bind(taskIntegration))
router.get('/integracao-tasksIntegration', isAuthenticated.bind(isAuthenticated), taskIntegration.list.bind(taskIntegration))

// Projetos
router.post('/integracao-projects', isAuthenticated.bind(isAuthenticated), projectController.create.bind(projectController))
router.get('/integracao-projects', isAuthenticated.bind(isAuthenticated), projectController.list.bind(projectController))
router.put('/integracao-projects', isAuthenticated.bind(isAuthenticated), projectController.update.bind(projectController))
router.get('/integracao-project', isAuthenticated.bind(isAuthenticated), projectController.detail.bind(projectController))
router.delete('/integracao-project', isAuthenticated.bind(isAuthenticated), projectController.deletar.bind(projectController))

// Tarefas Projeto
router.post('/integracao-tasks', isAuthenticated.bind(isAuthenticated), taskController.create.bind(taskController))
router.get('/integracao-tasks', isAuthenticated.bind(isAuthenticated), taskController.list.bind(taskController))
router.put('/integracao-tasks', isAuthenticated.bind(isAuthenticated), taskController.update.bind(taskController))
router.get('/integracao-task', isAuthenticated.bind(isAuthenticated), taskController.detail.bind(taskController))
router.delete('/integracao-task', isAuthenticated.bind(isAuthenticated), taskController.deletar.bind(taskController))
router.put('/integracao-tasks-conclusion', isAuthenticated.bind(isAuthenticated), taskController.conclusion.bind(taskController))
router.put('/integracao-tasks-completeRequest', isAuthenticated.bind(isAuthenticated), taskController.completeRequest.bind(taskController))

// Cobranças
router.put('/financeiro-tasks', isAuthenticated.bind(isAuthenticated), taskController.updateChargeFinanciero.bind(taskController))

// Planos
router.post('/integracao-plans', isAuthenticated.bind(isAuthenticated), planController.create.bind(planController))
router.get('/integracao-plans', isAuthenticated.bind(isAuthenticated), planController.list.bind(planController))
router.put('/integracao-plans', isAuthenticated.bind(isAuthenticated), planController.update.bind(planController))
router.get('/integracao-plan', isAuthenticated.bind(isAuthenticated), planController.detail.bind(planController))
router.delete('/integracao-plans', isAuthenticated.bind(isAuthenticated), planController.delete.bind(planController))
router.post('/integracao-plans-tasks', isAuthenticated.bind(isAuthenticated), planController.addTask.bind(planController))
router.get('/integracao-plans-tasks', isAuthenticated.bind(isAuthenticated), planController.listTasks.bind(planController))
router.put('/integracao-plans-tasks', isAuthenticated.bind(isAuthenticated), planController.reorderTask.bind(planController))
router.delete('/integracao-plans-tasks', isAuthenticated.bind(isAuthenticated), planController.deleteTask.bind(planController))
router.post('/integracao-plans-hire', isAuthenticated.bind(isAuthenticated), planController.hirePlan.bind(planController))

// PA
router.post('/client-pa', isAuthenticated.bind(isAuthenticated), paController.create.bind(paController))
router.get('/client-pa', isAuthenticated.bind(isAuthenticated), paController.detail.bind(paController))
router.put('/client-pa', isAuthenticated.bind(isAuthenticated), paController.update.bind(paController))

export default router
