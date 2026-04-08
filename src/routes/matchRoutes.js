const express = require('express');
const router = express.Router();
const {
  getDiscoveryQueue,
  swipeAction,
  getMatches,
  getMatchHistory,
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
  updateMatchSettings,
  getReportHistory,
  toggleSavedProfile,
  getSavedProfiles,
  getNearbyUsers,
  getAiIcebreaker,
  getAiMatchSummary,
  saveDateAvailability,
  getDateAvailability,
  createDatePlan,
  getDatePlans,
  updateDatePlanStatus,
  createSafetyCheckIn,
  getSafetyCheckIns,
  markSafetyCheckInSafe
} = require('../controllers/matchController');
const { protect } = require('../middleware/authMiddleware');
router.get('/discovery', protect, getDiscoveryQueue);
router.get('/matches', protect, getMatches);
router.get('/history', protect, getMatchHistory);
router.get('/likes', protect, getWhoLikedMe);
router.get('/top-picks', protect, getTopPicks);
router.get('/daily-recommendations', protect, getDailyRecommendations);
router.get('/saved', protect, getSavedProfiles);
router.get('/nearby', protect, getNearbyUsers);
router.get('/ai/icebreaker/:userId', protect, getAiIcebreaker);
router.get('/ai/summary/:userId', protect, getAiMatchSummary);
router.get('/date-plans', protect, getDatePlans);
router.get('/availability', protect, getDateAvailability);
router.get('/safety-checkins', protect, getSafetyCheckIns);
router.get('/report-history', protect, getReportHistory);
router.post('/swipe', protect, swipeAction);
router.post('/visit/:id', protect, logProfileVisit);
router.post('/blind-date/find', protect, findBlindDate);
router.post('/rewind', protect, rewindLastSwipe);
router.post('/boost', protect, activateBoost);
router.post('/travel', protect, setTravelMode);
router.post('/spotify', protect, saveSpotifyData);
router.post('/save', protect, toggleSavedProfile);
router.post('/availability', protect, saveDateAvailability);
router.post('/date-plans', protect, createDatePlan);
router.post('/safety-checkins', protect, createSafetyCheckIn);
router.post('/unmatch', protect, unmatchUser);
router.post('/report', protect, reportUser);       
router.post('/extend', protect, extendMatch);
router.post('/rematch', protect, rematchUser);
router.post('/instant-match', protect, instantMatch);
router.post('/poke', protect, pokeUser);
router.post('/reset-dislikes', protect, resetDislikes); 
router.put('/settings', protect, updateMatchSettings); 
router.put('/date-plans/:id/status', protect, updateDatePlanStatus);
router.put('/safety-checkins/:id/safe', protect, markSafetyCheckInSafe);
module.exports = router;
