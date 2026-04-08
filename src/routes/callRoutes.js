const express = require('express');
const router = express.Router();
const {
  startCall,
  answerCall,
  endCall,
  addSignal,
  getMyActiveCalls
} = require('../controllers/callController');
const { protect } = require('../middleware/authMiddleware');

router.get('/active', protect, getMyActiveCalls);
router.post('/start', protect, startCall);
router.post('/:id/answer', protect, answerCall);
router.post('/:id/end', protect, endCall);
router.post('/:id/signal', protect, addSignal);

module.exports = router;
