
const express = require('express');
const router = express.Router();
const { getMissionStatus, claimDailyLogin, claimDailyShare } = require('../controllers/missionController');
const { protect } = require('../middleware/authMiddleware');

router.get('/status', protect, getMissionStatus);
router.post('/login', protect, claimDailyLogin);
router.post('/share', protect, claimDailyShare);

module.exports = router;