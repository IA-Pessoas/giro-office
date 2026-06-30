import { Router } from "express"
import { isAuthenticated } from "../../middlewares/isAuthenticated"
import { ControlContabilController } from "../../controllers/contabil/ControlContabilController"
import { ResponsibleContabilController } from "../../controllers/contabil/ResponsibleContabilController"
import { RelationshipContabilController } from "../../controllers/contabil/RelationshipContabilController"

const router = Router()

const controller = new ControlContabilController();
const responsible = new ResponsibleContabilController();
const relationship = new RelationshipContabilController();

router.post('/contabil/controls', isAuthenticated, controller.create);
router.get('/contabil/controls', isAuthenticated, controller.detail);
router.patch('/contabil/controls/:id', isAuthenticated, controller.updateField);

// Responsavel
router.post('/contabil/responsibles', isAuthenticated, responsible.create);
router.put('/contabil/responsibles/:id', isAuthenticated, responsible.update);
router.get('/contabil/responsibles/client/:clientId', isAuthenticated, responsible.getByClientId);
router.delete('/contabil/responsibles/:id', isAuthenticated, responsible.delete);

// Relacionamento Contabil
router.post('/contabil/relationships', isAuthenticated, relationship.create);
router.put('/contabil/relationships/:id', isAuthenticated, relationship.update);
router.get('/contabil/relationships/client/:clientId', isAuthenticated, relationship.getByClientId);
router.delete('/contabil/relationships/:id', isAuthenticated, relationship.delete);

export default router;