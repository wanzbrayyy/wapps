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
const upload = require('../middleware/uploadMiddleware');

router.get('/conversations', protect, getConversations);

router.post('/', protect, upload.single('file'), sendMessage);

router.post('/reaction', protect, addReaction);

router.post('/preference', protect, upload.single('wallpaper'), setChatPreference);

router.get('/:userId', protect, getMessages);

module.exports = router;