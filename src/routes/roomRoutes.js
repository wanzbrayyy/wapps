
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
  getRoomMessages,
  getThreadMessages,
  pinRoomMessage,
  unpinRoomMessage,
  deleteRoomMessage,
  warnUser
} = require('../controllers/roomController');
const { protect } = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware');

router.post('/', protect, upload.single('roomImage'), createRoom);
router.get('/', protect, getAllRooms);

router.put('/image', protect, upload.single('roomImage'), updateRoomImage);

router.get('/:id', protect, getRoomById);
router.post('/:id/join', protect, joinRoom);
router.post('/:id/leave', protect, leaveRoom);
router.post('/:id/role', protect, assignRole);
router.post('/:id/kick', protect, kickUser);
router.post('/:id/ban', protect, banUser);
router.post('/:id/warn', protect, warnUser);
router.post('/:id/gift', protect, sendGift);
router.post('/:id/events', protect, createEvent);
router.get('/:id/messages', protect, getRoomMessages);
router.post('/:id/messages', protect, upload.single('file'), sendRoomMessage);
router.delete('/:id/messages/:messageId', protect, deleteRoomMessage);
router.get('/:id/messages/:messageId/thread', protect, getThreadMessages);
router.post('/:id/messages/:messageId/pin', protect, pinRoomMessage);
router.delete('/:id/messages/pin', protect, unpinRoomMessage);

module.exports = router;

