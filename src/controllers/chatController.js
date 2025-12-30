const Chat = require('../models/chat');
const User = require('../models/user');

const sendMessage = async (req, res) => {
  try {
    const { receiverId, message } = req.body;
    const senderId = req.user.id;

    if (!message) return res.status(400).json({ message: 'Message is required' });

    const newChat = await Chat.create({
      sender: senderId,
      receiver: receiverId,
      message
    });

    const fullChat = await Chat.findById(newChat._id)
      .populate('sender', 'username profilePic')
      .populate('receiver', 'username profilePic');

    res.status(201).json(fullChat);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getMessages = async (req, res) => {
  try {
    const { userId } = req.params;
    const myId = req.user.id;

    const messages = await Chat.find({
      $or: [
        { sender: myId, receiver: userId },
        { sender: userId, receiver: myId }
      ]
    })
    .sort({ createdAt: 1 })
    .populate('sender', 'username profilePic')
    .populate('receiver', 'username profilePic');

    res.json(messages);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getConversations = async (req, res) => {
  try {
    const currentUserId = req.user.id;
    
    // Cari semua chat yang melibatkan user saat ini
    const chats = await Chat.find({
      $or: [{ sender: currentUserId }, { receiver: currentUserId }]
    }).sort({ createdAt: -1 });

    const userIds = new Set();
    chats.forEach(chat => {
      const otherUserId = chat.sender.toString() === currentUserId 
        ? chat.receiver.toString() 
        : chat.sender.toString();
      userIds.add(otherUserId);
    });

    const users = await User.find({ _id: { $in: Array.from(userIds) } })
      .select('username fullName profilePic email');

    res.json(users);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  sendMessage,
  getMessages,
  getConversations
};