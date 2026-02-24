import { Router } from "express"
import { isAuthenticated } from "../../middlewares/isAuthenticated"
import { InstallmentController } from "../../controllers/parcelamento/InstallmentController"
import { PanoramaParcelamentoController } from "../../controllers/parcelamento/PanoramaParcelamentoController"

const router = Router()

const controller = new InstallmentController();
const panorama = new PanoramaParcelamentoController();

// Parcelamento
router.post('/parcelamento/installment', isAuthenticated, controller.create);
router.put('/parcelamento/installment', isAuthenticated, controller.update);
router.get('/parcelamento/installment', isAuthenticated, controller.detail);
router.get('/parcelamento/installments', isAuthenticated, controller.list);

// Parcelamento Competencia
router.post('/parcelamento/installment-comp', isAuthenticated, controller.createInstallmentCompetence);
router.put('/parcelamento/installment-comp/:id', isAuthenticated, controller.updateInstallmentCompetence);

// Panorama
router.post('/parcelamento/panorama', isAuthenticated, panorama.create);
router.get('/parcelamento/panorama', isAuthenticated, panorama.detail);
router.patch('/parcelamento/panorama/:id', isAuthenticated, panorama.updateField);
router.post('/parcelamento/panorama/comp', isAuthenticated, panorama.comp);

export default router;