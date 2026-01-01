const express = require('express');
const router = express.Router();
const { 
  sendMessage, 
  getMessages, 
  getConversations,
  addReaction,
  setChatPreference
} = require('../controllers/chatController');
const { protect } = require('../middleware/authMiddleware');

router.get('/conversations', protect, getConversations);
router.post('/', protect, sendMessage);
router.post('/reaction', protect, addReaction);
router.post('/preference', protect, setChatPreference);
router.get('/:userId', protect, getMessages);

module.exports = router;