const express = require('express');
const router = express.Router();
const walletController = require('../controllers/walletController');
const { authMiddleware } = require('../middlewares/authMiddleware');
const { walletLimiter } = require('../middlewares/rateLimiter');

router.use(authMiddleware);

router.get('/me', walletController.getWalletInfo);
router.post('/deposit', walletLimiter, walletController.deposit);
router.post('/withdraw', walletLimiter, walletController.withdraw);
router.get('/transactions', walletController.getTransactions);

module.exports = router;

