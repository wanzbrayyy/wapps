const Chat = require('../models/chat');
const ChatPreference = require('../models/chatPreference');
const User = require('../models/user');
const sendMessage = async (req, res) => {
  try {
    const { receiverId, message, replyTo, isDisappearing } = req.body;
    const senderId = req.user.id;

    if (!message) return res.status(400).json({ message: 'Message is required' });

    const chatData = {
      sender: senderId,
      receiver: receiverId,
      message,
      replyTo: replyTo || null
    };

    // Disappearing message logic (24 hours)
    if (isDisappearing) {
      chatData.expireAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    }

    const newChat = await Chat.create(chatData);

    const fullChat = await Chat.findById(newChat._id)
      .populate('sender', 'username profilePic')
      .populate('receiver', 'username profilePic')
      .populate('replyTo', 'message sender');

    res.status(201).json(fullChat);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const addReaction = async (req, res) => {
  try {
    const { chatId, type } = req.body;
    const chat = await Chat.findById(chatId);
    if (!chat) return res.status(404).json({ message: 'Chat not found' });

    // Remove existing reaction from this user if any
    chat.reactions = chat.reactions.filter(r => r.user.toString() !== req.user.id);
    
    chat.reactions.push({ user: req.user.id, type });
    await chat.save();
    
    res.json(chat);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getMessages = async (req, res) => {
  try {
    const { userId } = req.params;
    const myId = req.user.id;

    // Search query
    const { search } = req.query;
    let query = {
      $or: [
        { sender: myId, receiver: userId },
        { sender: userId, receiver: myId }
      ]
    };

    if (search) {
      query.message = { $regex: search, $options: 'i' };
    }

    const messages = await Chat.find(query)
      .sort({ createdAt: 1 })
      .populate('sender', 'username profilePic')
      .populate('receiver', 'username profilePic')
      .populate('replyTo', 'message sender')
      .populate('reactions.user', 'username profilePic');

    await Chat.updateMany(
      { sender: userId, receiver: myId, isRead: false },
      { $set: { isRead: true } }
    );

    res.json(messages);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// --- Preferences (Pin & Wallpaper) ---
const setChatPreference = async (req, res) => {
  try {
    const { targetUserId, wallpaper, isPinned } = req.body;
    
    let pref = await ChatPreference.findOne({ user: req.user.id, targetUser: targetUserId });
    
    if (!pref) {
      pref = new ChatPreference({ user: req.user.id, targetUser: targetUserId });
    }

    if (wallpaper !== undefined) pref.wallpaper = wallpaper;
    if (isPinned !== undefined) pref.isPinned = isPinned;

    await pref.save();
    res.json(pref);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getConversations = async (req, res) => {
  try {
    const currentUserId = req.user.id;
    const prefs = await ChatPreference.find({ user: currentUserId, isPinned: true });
    const pinnedIds = prefs.map(p => p.targetUser.toString());
    const chats = await Chat.find({
      $or: [{ sender: currentUserId }, { receiver: currentUserId }]
    }).sort({ createdAt: -1 });

    const conversationMap = new Map();
    chats.forEach(chat => {
      const otherId = chat.sender.toString() === currentUserId ? chat.receiver.toString() : chat.sender.toString();
      if (!conversationMap.has(otherId)) {
        conversationMap.set(otherId, {
          lastMessage: chat,
          isPinned: pinnedIds.includes(otherId)
        });
      }
    });

    // Populate user data
    const results = [];
    for (let [id, data] of conversationMap) {
      const user = await User.findById(id).select('username fullName profilePic');
      if (user) {
        results.push({
          userId: user._id,
          username: user.username,
          fullName: user.fullName,
          profilePic: user.profilePic,
          lastMessage: data.lastMessage.message,
          timestamp: data.lastMessage.createdAt,
          isPinned: data.isPinned
        });
      }
    }

    // Sort: Pinned first, then date
    results.sort((a, b) => {
      if (a.isPinned === b.isPinned) {
        return new Date(b.timestamp) - new Date(a.timestamp);
      }
      return a.isPinned ? -1 : 1;
    });

    res.json(results);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  sendMessage,
  getMessages,
  getConversations,
  addReaction,
  setChatPreference
};