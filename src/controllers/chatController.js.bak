const Chat = require('../models/chat');
const ChatPreference = require('../models/chatPreference');
const User = require('../models/user');
const axios = require('axios');
const FormData = require('form-data');
const { Readable } = require('stream');
const cloudinary = require('../config/cloudinary');
const isToday = (someDate) => {
  if (!someDate) return false;
  const today = new Date();
  return new Date(someDate).toDateString() === today.toDateString();
};

const streamUpload = (buffer, folder, resourceType = 'auto') => {
  return new Promise((resolve, reject) => {
    if (!buffer) return reject(new Error("Upload failed: Buffer is empty"));
    
    const stream = cloudinary.uploader.upload_stream(
      { folder: folder, resource_type: resourceType }, 
      (error, result) => {
        if (result) resolve(result); else reject(error);
      }
    );
    
    try {
      Readable.from(buffer).pipe(stream);
    } catch (err) {
      reject(err);
    }
  });
};
const sendMessage = async (req, res) => {
  try {
    const { 
      receiverId, 
      message, 
      type, 
      duration, 
      latitude, longitude, address 
    } = req.body;
    
    const senderId = req.user.id;
    let replyTo = req.body.replyTo;
    if (!replyTo || replyTo === 'null' || replyTo === 'undefined') replyTo = null;

    let isDisappearing = req.body.isDisappearing;
    if (typeof isDisappearing === 'string') isDisappearing = isDisappearing === 'true';
    let chatData = { 
      sender: senderId, 
      receiver: receiverId, 
      replyTo, 
      type: type || 'text' 
    };
    if (type === 'location') {
      chatData.location = {
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        address: address || ''
      };
      chatData.message = 'Shared a location';
    } 
        else if (!req.file) {
      if (!message && type !== 'sticker') {
        return res.status(400).json({ message: 'Message content is required' });
      }
      chatData.message = message;
    }
    if (req.file) {
      if (!req.file.buffer) {
        return res.status(400).json({ message: 'File upload failed: Buffer is empty' });
      }
      if (['image', 'audio', 'video'].includes(type)) {
        const resourceType = type === 'image' ? 'image' : 'video'; 
        const folder = `wapps_chat_${type}s`;
        
        const result = await streamUpload(req.file.buffer, folder, resourceType);
        
        chatData.fileInfo = { 
          url: result.secure_url, 
          name: req.file.originalname, 
          size: req.file.size, 
          mimeType: req.file.mimetype,
          duration: duration ? parseFloat(duration) : (result.duration || 0),
          thumbnail: type === 'video' ? result.secure_url.replace(/\.[^/.]+$/, ".jpg") : null 
        };
        chatData.message = message || (type.charAt(0).toUpperCase() + type.slice(1));
      } 
      else if (type === 'file') {
        try {
          const form = new FormData();
          form.append('reqtype', 'fileupload');
          if (process.env.CATBOX_USER_HASH) form.append('userhash', process.env.CATBOX_USER_HASH);
          form.append('fileToUpload', req.file.buffer, req.file.originalname);

          const response = await axios.post('https://catbox.moe/user/api.php', form, { 
            headers: form.getHeaders(),
            maxContentLength: Infinity,
            maxBodyLength: Infinity
          });

          chatData.fileInfo = { 
            url: response.data.toString().trim(), 
            name: req.file.originalname, 
            size: req.file.size, 
            mimeType: req.file.mimetype 
          };
          chatData.message = message || req.file.originalname;
        } catch (catboxError) {
          console.error("Catbox Upload Failed, falling back to Cloudinary Raw:", catboxError.message);
          const result = await streamUpload(req.file.buffer, 'wapps_chat_files', 'raw');
          chatData.fileInfo = {
            url: result.secure_url,
            name: req.file.originalname,
            size: req.file.size,
            mimeType: req.file.mimetype
          };
          chatData.message = message || req.file.originalname;
        }
      }
    }
    if (isDisappearing) {
      chatData.expireAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    }
    const newChat = await Chat.create(chatData);
    try {
      const senderUser = await User.findById(senderId);
      if (senderUser && senderUser.missionProgress && !isToday(senderUser.missionProgress.messagesSent.lastClaim)) {
        senderUser.missionProgress.messagesSent.count = (senderUser.missionProgress.messagesSent.count || 0) + 1;
        await senderUser.save();
      }
    } catch (ignore) { console.error("Mission Update Error", ignore); }
    const fullChat = await Chat.findById(newChat._id)
      .populate('sender', 'username profilePic fullName')
      .populate('replyTo', 'message sender type fileInfo');
      
    res.status(201).json(fullChat);

  } catch (error) {
    console.error("SendMessage Error:", error);
    res.status(500).json({ message: error.message || "Internal Server Error" });
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
      .populate('sender', 'username profilePic fullName')
      .populate('replyTo', 'message sender type fileInfo')
      .populate('reactions.user', 'username');
    const now = new Date();
    await Chat.updateMany(
      { sender: userId, receiver: myId, isRead: false }, 
      { $set: { isRead: true, readAt: now } }
    );
    
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
      if (!req.file.buffer) return res.status(400).json({ message: 'File buffer missing' });
      const result = await streamUpload(req.file.buffer, 'wapps_wallpapers', 'image');
      wallpaperUrl = result.secure_url;
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
    console.error("Preference Error:", error);
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
    const unreadMap = new Map();
    const unreadCounts = await Chat.aggregate([
      { $match: { receiver: new require('mongoose').Types.ObjectId(currentUserId), isRead: false } },
      { $group: { _id: "$sender", count: { $sum: 1 } } }
    ]);
    
    unreadCounts.forEach(u => unreadMap.set(u._id.toString(), u.count));

    chats.forEach(chat => {
      const otherId = chat.sender.toString() === currentUserId ? chat.receiver.toString() : chat.sender.toString();
      
      if (!conversationMap.has(otherId)) {
        conversationMap.set(otherId, { 
          lastMessage: chat, 
          isPinned: pinnedIds.includes(otherId),
          unreadCount: unreadMap.get(otherId) || 0
        });
      }
    });

    const results = [];
    for (let [id, data] of conversationMap) {
      const user = await User.findById(id).select('username fullName profilePic isOnline lastActive');
      if (user) {
        let previewText = data.lastMessage.message;
        if (data.lastMessage.type !== 'text') {
          previewText = data.lastMessage.type === 'location' 
            ? '📍 Shared a location' 
            : `Sent a ${data.lastMessage.type}`;
        }

        results.push({
          userId: user._id,
          username: user.username,
          fullName: user.fullName,
          profilePic: user.profilePic,
          isOnline: user.isOnline, 
          lastMessage: previewText,
          timestamp: data.lastMessage.createdAt,
          isPinned: data.isPinned,
          unreadCount: data.unreadCount
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