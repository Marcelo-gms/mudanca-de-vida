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
router.get('/pushinpay', (req, res) => adminController.renderPushinpaySettings(req, res));
router.get('/suitpay', (req, res) => res.redirect('/admin/pushinpay'));

// APIs Administrativas
router.post('/api/users/adjust-balance', (req, res) => adminController.adjustBalance(req, res));
router.post('/api/users/reset-rollover', (req, res) => adminController.resetRollover(req, res));
router.post('/api/users/toggle-status', (req, res) => adminController.toggleUserStatus(req, res));
router.post('/api/users/toggle-role', (req, res) => adminController.toggleUserRole(req, res));
router.post('/api/rtp/save', (req, res) => adminController.saveRtpSettings(req, res));
router.post('/api/rtp/simulate', (req, res) => adminController.simulateLive(req, res));

// PushinPay APIs
router.post('/api/pushinpay/save', (req, res) => adminController.savePushinpaySettings(req, res));
router.post('/api/pushinpay/test', (req, res) => adminController.testPushinpayConnection(req, res));

// Alias para compatibilidade
router.post('/api/suitpay/save', (req, res) => adminController.savePushinpaySettings(req, res));
router.post('/api/suitpay/test', (req, res) => adminController.testPushinpayConnection(req, res));

module.exports = router;
