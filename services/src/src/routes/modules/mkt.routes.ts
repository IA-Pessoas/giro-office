import { Router } from "express"
import { isAuthenticated } from "../../middlewares/isAuthenticated"
import { PasswordController } from "../../controllers/mkt/PasswordController"

const router = Router()

const controller = new PasswordController();

// Aplicar autenticação a todas
router.use(isAuthenticated);

router.post('/mkt/passwords', controller.create.bind(controller));
router.put('/mkt/passwords', controller.update.bind(controller));
router.get('/mkt/passwords/all', controller.list.bind(controller));
router.get('/mkt/passwords', controller.detail.bind(controller));

export default router;