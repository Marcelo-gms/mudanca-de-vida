const express = require('express');
const router = express.Router();
const webhookController = require('../controllers/webhookController');

// Webhook oficial PushinPay
router.post('/pushinpay', (req, res) => webhookController.handlePushinpayWebhook(req, res));

// Rota de compatibilidade
router.post('/suitpay', (req, res) => webhookController.handlePushinpayWebhook(req, res));

// Simulação de pagamento mock em desenvolvimento
router.post('/mock-pay', (req, res) => webhookController.handleMockPay(req, res));

module.exports = router;
