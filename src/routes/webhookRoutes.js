const express = require('express');
const router = express.Router();
const webhookController = require('../controllers/webhookController');

router.post('/suitpay', webhookController.handleSuitpayWebhook);
router.post('/mock-pay', webhookController.handleMockPay);

module.exports = router;

