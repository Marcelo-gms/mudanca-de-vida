const express = require('express');
const router = express.Router();
const webhookController = require('../controllers/webhookController');
const { authMiddleware } = require('../middlewares/authMiddleware');

// Webhook oficial Asaas (autenticado pelo token `asaas-access-token`)
router.post('/asaas', (req, res) => webhookController.handleAsaasWebhook(req, res));

// Simulação de pagamento mock em desenvolvimento (exige login: só credita a própria transação)
router.post('/mock-pay', authMiddleware, (req, res) => webhookController.handleMockPay(req, res));

module.exports = router;
