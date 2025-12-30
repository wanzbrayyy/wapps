const express = require('express');
const router = express.Router();
const {
  getDiscoveryQueue,
  swipeAction,
  getMatches,
  getWhoLikedMe,
  logProfileVisit,
  findBlindDate,
} = require('../controllers/matchController');
const { protect } = require('../middleware/authMiddleware');

router.get('/discovery', protect, getDiscoveryQueue);
router.post('/swipe', protect, swipeAction);
router.get('/matches', protect, getMatches);
router.get('/likes', protect, getWhoLikedMe);
router.post('/visit/:id', protect, logProfileVisit);
router.post('/blind-date/find', protect, findBlindDate);

module.exports = router;