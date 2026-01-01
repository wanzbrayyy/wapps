const express = require('express');
const router = express.Router();
const { getMissionStatus, claimMission } = require('../controllers/missionController');
const { protect } = require('../middleware/authMiddleware');

router.get('/status', protect, getMissionStatus);
router.post('/claim', protect, claimMission);

module.exports = router;