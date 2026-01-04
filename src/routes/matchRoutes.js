const express = require('express');
const router = express.Router();
const {
  getDiscoveryQueue,
  swipeAction,
  getMatches,
  getWhoLikedMe,
  logProfileVisit,
  findBlindDate,
  getTopPicks,
  rewindLastSwipe,
  activateBoost,
  setTravelMode,
  saveSpotifyData,
  unmatchUser,
  reportUser,
  extendMatch,
  rematchUser,
  instantMatch,
  pokeUser,
  getDailyRecommendations,
  resetDislikes,
  updateMatchSettings
} = require('../controllers/matchController');
const { protect } = require('../middleware/authMiddleware');
router.get('/discovery', protect, getDiscoveryQueue);
router.get('/matches', protect, getMatches);
router.get('/likes', protect, getWhoLikedMe);
router.get('/top-picks', protect, getTopPicks);
router.get('/daily-recommendations', protect, getDailyRecommendations); 
router.post('/swipe', protect, swipeAction);
router.post('/visit/:id', protect, logProfileVisit);
router.post('/blind-date/find', protect, findBlindDate);
router.post('/rewind', protect, rewindLastSwipe);
router.post('/boost', protect, activateBoost);
router.post('/travel', protect, setTravelMode);
router.post('/spotify', protect, saveSpotifyData);
router.post('/unmatch', protect, unmatchUser);
router.post('/report', protect, reportUser);       
router.post('/extend', protect, extendMatch);
router.post('/rematch', protect, rematchUser);
router.post('/instant-match', protect, instantMatch);
router.post('/poke', protect, pokeUser);
router.post('/reset-dislikes', protect, resetDislikes); 
router.put('/settings', protect, updateMatchSettings); 
module.exports = router;