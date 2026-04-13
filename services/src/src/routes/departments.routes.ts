import { Router } from "express"
import multer from "multer"
import { isAuthenticated } from "../middlewares/isAuthenticated"
import { DepartmentController } from "../controllers/DepartmentController"

const router = Router()
const upload = multer({ storage: multer.memoryStorage() })

const departmentController = new DepartmentController()

router.post('/departments', isAuthenticated.bind(isAuthenticated), departmentController.create.bind(DepartmentController))
router.get('/departments', isAuthenticated.bind(isAuthenticated), departmentController.list.bind(DepartmentController))
router.put('/departments', isAuthenticated.bind(isAuthenticated), departmentController.update.bind(DepartmentController))
router.get('/department', isAuthenticated.bind(isAuthenticated), departmentController.details.bind(DepartmentController))

export default router