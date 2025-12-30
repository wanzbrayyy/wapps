const Room = require('../models/room');
const RoomMessage = require('../models/roomMessage');

const createRoom = async (req, res) => {
  try {
    const { title, category, description } = req.body;
    
    const newRoom = await Room.create({
      title,
      category,
      description,
      creator: req.user.id,
      participants: [req.user.id]
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
      .populate('participants', 'username profilePic fullName');
    
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

const sendRoomMessage = async (req, res) => {
  try {
    const { message, type } = req.body;
    const roomId = req.params.id;

    const newMsg = await RoomMessage.create({
      room: roomId,
      sender: req.user.id,
      message,
      type
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
  sendRoomMessage,
  getRoomMessages
};