
const Chat = require('../models/chat');
const ChatPreference = require('../models/chatPreference');
const User = require('../models/user');
const axios = require('axios');
const FormData = require('form-data');
const { Readable } = require('stream');
const cloudinary = require('../config/cloudinary');

const streamUpload = (buffer, folder) => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream({ folder: folder }, (error, result) => {
      if (result) resolve(result); else reject(error);
    });
    Readable.from(buffer).pipe(stream);
  });
};

const sendMessage = async (req, res) => {
  try {
    const { receiverId, message, replyTo, isDisappearing, type } = req.body;
    const senderId = req.user.id;
    let chatData = { sender: senderId, receiver: receiverId, replyTo, type: type || 'text' };

    if (req.file) {
      if (type === 'image') {
        const result = await streamUpload(req.file.buffer, 'wapps_chat_images');
        chatData.fileInfo = { url: result.secure_url, name: req.file.originalname, size: req.file.size, mimeType: req.file.mimetype };
        chatData.message = message || 'Image';
      } else if (type === 'file') {
        const form = new FormData();
        form.append('reqtype', 'fileupload');
        form.append('userhash', process.env.CATBOX_USER_HASH);
        form.append('fileToUpload', req.file.buffer, req.file.originalname);
        const { data: fileUrl } = await axios.post('https://catbox.moe/user/api.php', form, { headers: form.getHeaders() });
        chatData.fileInfo = { url: fileUrl, name: req.file.originalname, size: req.file.size, mimeType: req.file.mimetype };
        chatData.message = message || req.file.originalname;
      }
    } else {
      if (!message) return res.status(400).json({ message: 'Message is required for text type' });
      chatData.message = message;
    }

    if (isDisappearing) {
      chatData.expireAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    }
    
    const newChat = await Chat.create(chatData);
    const fullChat = await Chat.findById(newChat._id).populate('sender', 'username profilePic').populate('replyTo', 'message sender');
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
    let query = { $or: [{ sender: myId, receiver: userId }, { sender: userId, receiver: myId }] };

    if (search) {
      query.message = { $regex: search, $options: 'i' };
    }

    const messages = await Chat.find(query).sort({ createdAt: 1 }).populate('sender', 'username profilePic').populate('replyTo', 'message sender').populate('reactions.user', 'username');
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
      const result = await streamUpload(req.file.buffer, 'wapps_wallpapers');
      wallpaperUrl = result.secure_url;
    }
    
    const updateData = {};
    if (wallpaperUrl) updateData.wallpaper = wallpaperUrl;
    if (isPinned !== undefined) updateData.isPinned = isPinned;

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