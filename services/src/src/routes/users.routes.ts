import { Router } from "express"
import multer from "multer"
import { isAuthenticated } from "../middlewares/isAuthenticated"
import { UserController } from "../controllers/UserController"

const router = Router()
const upload = multer({ storage: multer.memoryStorage() })

const userController = new UserController()

router.post('/start-config', new UserController().firstCreate.bind(userController))
router.post('/users', isAuthenticated, new UserController().create.bind(userController))
router.post('/session', new UserController().login.bind(userController))
router.get('/me', isAuthenticated, new UserController().detail.bind(userController))
router.get('/users', isAuthenticated, new UserController().list.bind(userController))
router.put('/users', isAuthenticated, upload.single("file"), new UserController().update.bind(userController) as any)
router.get('/users-detail', isAuthenticated, new UserController().details.bind(userController))
router.get('/users-photo', isAuthenticated, new UserController().getUserPhoto.bind(userController))
router.post('/permission', isAuthenticated, new UserController().createPermission.bind(userController))
router.get('/permission', isAuthenticated, new UserController().getPermission.bind(userController))
router.post('/permission-specific', isAuthenticated, new UserController().createPermissionSpecific.bind(userController))
router.put('/permission-specific', isAuthenticated, new UserController().updatePermissionSpecific.bind(userController))
router.get('/permission-specific', isAuthenticated, new UserController().getPermissionSpecific.bind(userController))

export default router