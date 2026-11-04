const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authLimiter } = require('../middlewares/rateLimiter');

router.get('/login', authController.renderLoginPage);
router.post('/login', authLimiter, authController.login);

router.get('/register', authController.renderRegisterPage);
router.post('/register', authLimiter, authController.register);

router.get('/logout', authController.logout);

module.exports = router;

