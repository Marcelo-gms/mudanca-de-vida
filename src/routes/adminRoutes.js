const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { authMiddleware } = require('../middlewares/authMiddleware');
const { adminMiddleware } = require('../middlewares/adminMiddleware');

// Aplica autenticação e verificação de admin em todas as rotas do painel
router.use(authMiddleware);
router.use(adminMiddleware);

// Páginas do Painel
router.get('/', adminController.renderDashboard);
router.get('/users', adminController.renderUsers);
router.get('/rtp', adminController.renderRtpSettings);
router.get('/suitpay', adminController.renderSuitpaySettings);

// APIs Administrativas
router.post('/api/users/adjust-balance', adminController.adjustBalance);
router.post('/api/users/reset-rollover', adminController.resetRollover);
router.post('/api/users/toggle-status', adminController.toggleUserStatus);
router.post('/api/users/toggle-role', adminController.toggleUserRole);
router.post('/api/rtp/save', adminController.saveRtpSettings);
router.post('/api/rtp/simulate', adminController.simulateLive);
router.post('/api/suitpay/save', adminController.saveSuitpaySettings);
router.post('/api/suitpay/test', (req, res) => adminController.testSuitpayConnection(req, res));

module.exports = router;

