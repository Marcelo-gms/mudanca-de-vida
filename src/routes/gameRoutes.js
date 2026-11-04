const express = require('express');
const router = express.Router();
const gameController = require('../controllers/gameController');
const { authMiddleware } = require('../middlewares/authMiddleware');
const { spinLimiter } = require('../middlewares/rateLimiter');

router.use(authMiddleware);

router.post('/spin', spinLimiter, gameController.spin);
router.get('/history', gameController.getHistory);

module.exports = router;

