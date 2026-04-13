import { Router } from 'express';
import { EmailController } from '../controllers/EmailController';
import { isAuthenticated } from "../middlewares/isAuthenticated"

const router = Router();

const emailController = new EmailController();

router.post('/email', isAuthenticated.bind(isAuthenticated), emailController.create.bind(EmailController))
router.put('/email', isAuthenticated.bind(isAuthenticated), emailController.update.bind(EmailController))
router.get('/email', isAuthenticated.bind(isAuthenticated), emailController.details.bind(EmailController))
router.get('/emails', isAuthenticated.bind(isAuthenticated), emailController.list.bind(EmailController))
router.delete('/email', isAuthenticated.bind(isAuthenticated), emailController.delete.bind(EmailController))

router.post('/email-welcome', isAuthenticated.bind(isAuthenticated), new EmailController().sendWelcomeEmail.bind(emailController));

export default router;