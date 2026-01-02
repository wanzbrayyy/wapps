const Chat = require('../models/chat');
const ChatPreference = require('../models/chatPreference');
const User = require('../models/user');
const axios = require('axios');
const FormData = require('form-data');
const { Readable } = require('stream');
const cloudinary = require('../config/cloudinary');

const sendMessage = async (req, res) => {
  try {
    const { receiverId, message, type } = req.body;
    const senderId = req.user.id;
    
    let replyTo = req.body.replyTo;
    if (!replyTo || replyTo === 'null' || replyTo === 'undefined') replyTo = null;

    let isDisappearing = req.body.isDisappearing;
    if (typeof isDisappearing === 'string') isDisappearing = isDisappearing === 'true';

    const chatData = { 
      sender: senderId, 
      receiver: receiverId, 
      replyTo, 
      type: type || 'text' 
    };

    if (req.file) {
      chatData.fileInfo = { 
        url: req.file.path, 
        name: req.file.originalname, 
        size: req.file.size, 
        mimeType: req.file.mimetype 
      };
      
      if (type === 'image') {
        chatData.message = message || 'Image';
      } else {
        chatData.type = 'file'; 
        chatData.message = message || req.file.originalname;
      }
    } else {
      if (!message || !message.trim()) {
        return res.status(400).json({ message: 'Message cannot be empty' });
      }
      chatData.message = message;
    }

    if (isDisappearing) {
      chatData.expireAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    }
    
    const newChat = await Chat.create(chatData);

    try {
      const senderUser = await User.findById(senderId);
      const today = new Date().toDateString();
      if (senderUser && senderUser.missionProgress) {
        const lastClaim = senderUser.missionProgress.messagesSent.lastClaim;
        if (!lastClaim || new Date(lastClaim).toDateString() !== today) {
          senderUser.missionProgress.messagesSent.count = (senderUser.missionProgress.messagesSent.count || 0) + 1;
          await senderUser.save();
        }
      }
    } catch (ignore) {}

    const fullChat = await Chat.findById(newChat._id)
      .populate('sender', 'username profilePic')
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
    const { search } = req.query;
    
    let query = { 
      $or: [{ sender: myId, receiver: userId }, { sender: userId, receiver: myId }] 
    };

    if (search) {
      query.message = { $regex: search, $options: 'i' };
    }

    const messages = await Chat.find(query)
      .sort({ createdAt: 1 })
      .populate('sender', 'username profilePic')
      .populate('replyTo', 'message sender')
      .populate('reactions.user', 'username');
      
    await Chat.updateMany({ sender: userId, receiver: myId, isRead: false }, { $set: { isRead: true } });
    
    res.json(messages);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const setChatPreference = async (req, res) => {
  try {
    const { targetUserId, isPinned } = req.body;
    let wallpaperUrl;

    if (req.file) {
      wallpaperUrl = req.file.path;
    }
    
    const updateData = {};
    if (wallpaperUrl) updateData.wallpaper = wallpaperUrl;
    if (isPinned !== undefined) updateData.isPinned = (isPinned === 'true' || isPinned === true);

    const pref = await ChatPreference.findOneAndUpdate(
      { user: req.user.id, targetUser: targetUserId },
      { $set: updateData },
      { new: true, upsert: true }
    );
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
    const chats = await Chat.find({ $or: [{ sender: currentUserId }, { receiver: currentUserId }] }).sort({ createdAt: -1 });

    const conversationMap = new Map();
    chats.forEach(chat => {
      const otherId = chat.sender.toString() === currentUserId ? chat.receiver.toString() : chat.sender.toString();
      if (!conversationMap.has(otherId)) {
        conversationMap.set(otherId, { lastMessage: chat, isPinned: pinnedIds.includes(otherId) });
      }
    });

    const results = [];
    for (let [id, data] of conversationMap) {
      const user = await User.findById(id).select('username fullName profilePic');
      if (user) {
        results.push({
          userId: user._id,
          username: user.username,
          fullName: user.fullName,
          profilePic: user.profilePic,
          lastMessage: data.lastMessage.type === 'text' ? data.lastMessage.message : `Sent a ${data.lastMessage.type}`,
          timestamp: data.lastMessage.createdAt,
          isPinned: data.isPinned
        });
      }
    }

    results.sort((a, b) => {
      if (a.isPinned === b.isPinned) return new Date(b.timestamp) - new Date(a.timestamp);
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