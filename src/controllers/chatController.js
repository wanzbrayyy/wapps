const Chat = require('../models/chat');
const ChatPreference = require('../models/chatPreference');
const User = require('../models/user');
const axios = require('axios');
const FormData = require('form-data');
const { Readable } = require('stream');
const cloudinary = require('../config/cloudinary');

// Helper: Cek tanggal hari ini
const isToday = (someDate) => {
  if (!someDate) return false;
  const today = new Date();
  return new Date(someDate).toDateString() === today.toDateString();
};

// Helper: Upload ke Cloudinary (Fix: resource_type: "auto")
const streamUpload = (buffer, folder) => {
  return new Promise((resolve, reject) => {
    if (!buffer) {
      return reject(new Error("Upload failed: Buffer is empty"));
    }
    
    // Tambahkan resource_type: "auto" agar tidak error "unknown file format"
    const stream = cloudinary.uploader.upload_stream(
      { folder: folder, resource_type: "auto" }, 
      (error, result) => {
        if (result) {
          resolve(result);
        } else {
          // Pastikan error selalu berbentuk Error object agar bisa di-catch
          reject(new Error(error.message || "Cloudinary Upload Error"));
        }
      }
    );

    // Handle stream errors
    Readable.from(buffer)
      .pipe(stream)
      .on('error', (err) => reject(err));
  });
};

const sendMessage = async (req, res) => {
  try {
    const { receiverId, message, type } = req.body;
    const senderId = req.user.id;

    // Normalisasi input
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

    // --- LOGIKA FILE / IMAGE ---
    if (type === 'image' || type === 'file') {
      if (!req.file || !req.file.buffer) {
        return res.status(400).json({ message: `File is required for type ${type}` });
      }

      // 1. Upload IMAGE ke Cloudinary
      if (type === 'image') {
        try {
          const result = await streamUpload(req.file.buffer, 'wapps_chat_images');
          chatData.fileInfo = { 
            url: result.secure_url, 
            name: req.file.originalname, 
            size: req.file.size, 
            mimeType: req.file.mimetype 
          };
          chatData.message = message || 'Image';
        } catch (uploadError) {
          console.error("Cloudinary Error:", uploadError.message);
          return res.status(400).json({ message: "Failed to upload image. Format not supported." });
        }
      
      // 2. Upload FILE ke Catbox
      } else if (type === 'file') {
        const form = new FormData();
        form.append('reqtype', 'fileupload');
        if (process.env.CATBOX_USER_HASH) {
          form.append('userhash', process.env.CATBOX_USER_HASH);
        }
        form.append('fileToUpload', req.file.buffer, req.file.originalname);

        try {
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
          console.error("Catbox Error:", catboxError.message);
          return res.status(502).json({ message: "Failed to upload file to external server" });
        }
      }
    } else {
      // --- LOGIKA TEXT ---
      if (!message || !message.trim()) {
        return res.status(400).json({ message: 'Message is required' });
      }
      chatData.message = message;
    }

    if (isDisappearing) {
      chatData.expireAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    }
    
    // Simpan ke DB
    const newChat = await Chat.create(chatData);

    // Update Misi Harian (Opsional)
    try {
        const senderUser = await User.findById(senderId);
        if (senderUser && senderUser.missionProgress) {
            if (!isToday(senderUser.missionProgress.messagesSent.lastClaim)) {
                senderUser.missionProgress.messagesSent.count = (senderUser.missionProgress.messagesSent.count || 0) + 1;
                await senderUser.save();
            }
        }
    } catch (missionErr) {
        console.error("Mission Update Error (Ignored):", missionErr.message);
    }

    // Populate Response
    const fullChat = await Chat.findById(newChat._id)
      .populate('sender', 'username profilePic')
      .populate('replyTo', 'message sender');
      
    res.status(201).json(fullChat);

  } catch (error) {
    console.error("SendMessage Critical Error:", error);
    res.status(500).json({ message: "Internal Server Error", detail: error.message });
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
      
    // Mark as read
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
      // Wallpaper biasanya gambar, tapi kita set auto supaya aman
      const result = await streamUpload(req.file.buffer, 'wapps_wallpapers');
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