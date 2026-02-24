import { Router } from "express";
import { isAuthenticated } from "../../middlewares/isAuthenticated";
import { TiController } from "../../controllers/ti/TiController";

const router = Router();
const controller = new TiController();

// --- HELPDESK ---
router.post('/ti/helpdesk/category', isAuthenticated, controller.createHelpdeskCategory);
router.post('/ti/helpdesk/request', isAuthenticated, controller.createRequest);
router.get('/ti/helpdesk/list', isAuthenticated, controller.listRequests);
router.get('/ti/helpdesk/detail', isAuthenticated, controller.detailRequest);
router.post('/ti/helpdesk/message', isAuthenticated, controller.sendMessage);

// --- SENHAS E RAMAIS ---
router.post('/ti/password', isAuthenticated, controller.createPassword);
router.put('/ti/password', isAuthenticated, controller.updatePassword);
router.get('/ti/password/list', isAuthenticated, controller.listPasswords);
router.get('/ti/password/detail', isAuthenticated, controller.detailPassword);
router.delete('/ti/password', isAuthenticated, controller.deletePassword);
router.post('/ti/extension', isAuthenticated, controller.createExtension);
router.put('/ti/extension', isAuthenticated, controller.updateExtension);
router.get('/ti/extension/list', isAuthenticated, controller.listExtensions);
router.delete('/ti/extension', isAuthenticated, controller.deleteExtension);

// --- INVENTÁRIO (CATEGORIAS) ---
router.post('/ti/inventory/category', isAuthenticated, controller.createInventoryCategory);
router.put('/ti/inventory/category', isAuthenticated, controller.updateInventoryCategory);
router.get('/ti/inventory/category/list', isAuthenticated, controller.listInventoryCategories);
router.delete('/ti/inventory/category', isAuthenticated, controller.deleteInventoryCategory);

// --- INVENTÁRIO (LOCAIS) ---
router.post('/ti/inventory/location', isAuthenticated, controller.createInventoryLocation);
router.put('/ti/inventory/location', isAuthenticated, controller.updateInventoryLocation);
router.get('/ti/inventory/location/list', isAuthenticated, controller.listInventoryLocation);
router.delete('/ti/inventory/location', isAuthenticated, controller.deleteInventoryLocation);

// --- INVENTÁRIO (ITENS/ATIVOS) ---
router.post('/ti/inventory/item', isAuthenticated, controller.createAsset);
router.get('/ti/inventory/list', isAuthenticated, controller.listAssets);
router.put('/ti/inventory/item', isAuthenticated, controller.updateAsset);
router.delete('/ti/inventory/item', isAuthenticated, controller.deleteAsset);

// --- TERMOS ---
router.post('/ti/term', isAuthenticated, controller.createTerm);
router.get('/ti/term/list', isAuthenticated, controller.listTerms);
router.put('/ti/term', isAuthenticated, controller.updateTerm);
router.delete('/ti/term', isAuthenticated, controller.deleteTerm);

export default router;