cat << 'EOF' > src/routes/roomRoutes.js
const express = require('express');
const router = express.Router();
const { 
  createRoom,
  updateRoomImage,
  getAllRooms,
  getRoomById,
  joinRoom,
  leaveRoom,
  assignRole,
  kickUser,
  banUser,
  sendGift,
  createEvent,
  sendRoomMessage,
  getRoomMessages
} = require('../controllers/roomController');
const { protect } = require('../middleware/authMiddleware');

router.post('/', protect, createRoom);
router.get('/', protect, getAllRooms);

router.put('/image', protect, updateRoomImage);

router.get('/:id', protect, getRoomById);
router.post('/:id/join', protect, joinRoom);
router.post('/:id/leave', protect, leaveRoom);
router.post('/:id/role', protect, assignRole);
router.post('/:id/kick', protect, kickUser);
router.post('/:id/ban', protect, banUser);
router.post('/:id/gift', protect, sendGift);
router.post('/:id/events', protect, createEvent);
router.get('/:id/messages', protect, getRoomMessages);
router.post('/:id/messages', protect, sendRoomMessage);

module.exports = router;
EOF