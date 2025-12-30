const express = require('express');
const router = express.Router();
const { 
  createRoom, 
  getAllRooms, 
  getRoomById, 
  joinRoom, 
  leaveRoom,
  sendRoomMessage,
  getRoomMessages
} = require('../controllers/roomController');
const { protect } = require('../middleware/authMiddleware');

router.post('/', protect, createRoom);
router.get('/', protect, getAllRooms);
router.get('/:id', protect, getRoomById);
router.post('/:id/join', protect, joinRoom);
router.post('/:id/leave', protect, leaveRoom);
router.get('/:id/messages', protect, getRoomMessages);
router.post('/:id/messages', protect, sendRoomMessage);

module.exports = router;