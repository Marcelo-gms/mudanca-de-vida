const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { authMiddleware } = require('../middlewares/authMiddleware');
const { adminMiddleware } = require('../middlewares/adminMiddleware');

// Aplica autenticação e verificação de admin em todas as rotas do painel
router.use(authMiddleware);
router.use(adminMiddleware);

// Páginas do Painel
router.get('/', (req, res) => adminController.renderDashboard(req, res));
router.get('/users', (req, res) => adminController.renderUsers(req, res));
router.get('/rtp', (req, res) => adminController.renderRtpSettings(req, res));
router.get('/asaas', (req, res) => adminController.renderAsaasSettings(req, res));

// APIs Administrativas
router.post('/api/users/adjust-balance', (req, res) => adminController.adjustBalance(req, res));
router.post('/api/users/reset-rollover', (req, res) => adminController.resetRollover(req, res));
router.post('/api/users/toggle-status', (req, res) => adminController.toggleUserStatus(req, res));
router.post('/api/users/toggle-role', (req, res) => adminController.toggleUserRole(req, res));
router.post('/api/rtp/save', (req, res) => adminController.saveRtpSettings(req, res));
router.post('/api/rtp/simulate', (req, res) => adminController.simulateLive(req, res));

// Asaas APIs
router.post('/api/asaas/save', (req, res) => adminController.saveAsaasSettings(req, res));
router.post('/api/asaas/test', (req, res) => adminController.testAsaasConnection(req, res));

module.exports = router;
