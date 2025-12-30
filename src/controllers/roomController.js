const Room = require('../models/room');
const RoomMessage = require('../models/roomMessage');
const User = require('../models/user');

const createRoom = async (req, res) => {
  try {
    const { title, category, description } = req.body;
    
    const newRoom = await Room.create({
      title,
      category,
      description,
      creator: req.user.id,
      participants: [req.user.id],
      admins: [req.user.id]
    });

    res.status(201).json(newRoom);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getAllRooms = async (req, res) => {
  try {
    const rooms = await Room.find({ isActive: true })
      .populate('creator', 'username profilePic')
      .populate('participants', 'username profilePic')
      .sort({ createdAt: -1 });
    res.json(rooms);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getRoomById = async (req, res) => {
  try {
    const room = await Room.findById(req.params.id)
      .populate('creator', 'username profilePic fullName')
      .populate('participants', 'username profilePic fullName')
      .populate('admins', 'username')
      .populate('moderators', 'username')
      .populate('events.createdBy', 'username');
    
    if (!room) return res.status(404).json({ message: 'Room not found' });
    res.json(room);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const joinRoom = async (req, res) => {
  try {
    const room = await Room.findById(req.params.id);
    if (!room) return res.status(404).json({ message: 'Room not found' });

    if (room.bannedUsers.includes(req.user.id)) {
      return res.status(403).json({ message: 'You are banned from this room' });
    }

    if (!room.participants.includes(req.user.id)) {
      room.participants.push(req.user.id);
      await room.save();
    }

    res.json(room);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const leaveRoom = async (req, res) => {
  try {
    const room = await Room.findById(req.params.id);
    if (!room) return res.status(404).json({ message: 'Room not found' });

    room.participants = room.participants.filter(
      (id) => id.toString() !== req.user.id
    );
    
    await room.save();
    res.json({ message: 'Left room successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const assignRole = async (req, res) => {
  try {
    const { userId, role } = req.body;
    const roomId = req.params.id;
    
    const room = await Room.findById(roomId);
    if (!room) return res.status(404).json({ message: 'Room not found' });

    const isCreator = room.creator.toString() === req.user.id;
    const isAdmin = room.admins.includes(req.user.id);

    if (!isCreator && !isAdmin) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    if (role === 'admin') {
      if (!room.admins.includes(userId)) room.admins.push(userId);
    } else if (role === 'moderator') {
      if (!room.moderators.includes(userId)) room.moderators.push(userId);
    }

    await room.save();
    res.json(room);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const kickUser = async (req, res) => {
  try {
    const { userId } = req.body;
    const room = await Room.findById(req.params.id);
    
    if (!room) return res.status(404).json({ message: 'Room not found' });

    const isMod = room.moderators.includes(req.user.id);
    const isAdmin = room.admins.includes(req.user.id);
    const isCreator = room.creator.toString() === req.user.id;

    if (!isMod && !isAdmin && !isCreator) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    room.participants = room.participants.filter(id => id.toString() !== userId);
    await room.save();
    res.json({ message: 'User kicked' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const banUser = async (req, res) => {
  try {
    const { userId } = req.body;
    const room = await Room.findById(req.params.id);

    if (!room) return res.status(404).json({ message: 'Room not found' });
    
    const isAdmin = room.admins.includes(req.user.id);
    const isCreator = room.creator.toString() === req.user.id;

    if (!isAdmin && !isCreator) {
      return res.status(403).json({ message: 'Admins only' });
    }

    room.participants = room.participants.filter(id => id.toString() !== userId);
    if (!room.bannedUsers.includes(userId)) {
      room.bannedUsers.push(userId);
    }
    
    await room.save();
    res.json({ message: 'User banned' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const sendGift = async (req, res) => {
  try {
    const { amount } = req.body;
    const roomId = req.params.id;
    
    const sender = await User.findById(req.user.id);
    const room = await Room.findById(roomId);
    
    if (!room) return res.status(404).json({ message: 'Room not found' });
    
    const host = await User.findById(room.creator);

    if (sender.coins < amount) {
      return res.status(400).json({ message: 'Insufficient coins' });
    }

    sender.coins -= amount;
    host.coins += amount;

    await sender.save();
    await host.save();

    await RoomMessage.create({
      room: roomId,
      sender: req.user.id,
      message: `Sent a gift of ${amount} coins! 🎁`,
      type: 'system'
    });

    res.json({ message: 'Gift sent', newBalance: sender.coins });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const createEvent = async (req, res) => {
  try {
    const { title, date, description } = req.body;
    const room = await Room.findById(req.params.id);

    if (!room) return res.status(404).json({ message: 'Room not found' });

    const isAdmin = room.admins.includes(req.user.id);
    const isCreator = room.creator.toString() === req.user.id;

    if (!isAdmin && !isCreator) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    room.events.push({ title, date, description, createdBy: req.user.id });
    await room.save();
    res.json(room.events);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const sendRoomMessage = async (req, res) => {
  try {
    const { message, type } = req.body;
    const roomId = req.params.id;

    const newMsg = await RoomMessage.create({
      room: roomId,
      sender: req.user.id,
      message,
      type: type || 'text'
    });

    const fullMsg = await RoomMessage.findById(newMsg._id)
      .populate('sender', 'username profilePic fullName');

    res.status(201).json(fullMsg);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getRoomMessages = async (req, res) => {
  try {
    const messages = await RoomMessage.find({ room: req.params.id })
      .populate('sender', 'username profilePic fullName')
      .sort({ createdAt: 1 });
    
    res.json(messages);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  createRoom,
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
};