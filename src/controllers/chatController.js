const Chat = require('../models/chat');
const ChatPreference = require('../models/chatPreference');
const User = require('../models/user');
const axios = require('axios');
const FormData = require('form-data');
const { Readable } = require('stream');
const cloudinary = require('../config/cloudinary');

// Helper: Cek apakah tanggal hari ini
const isToday = (someDate) => {
  if (!someDate) return false;
  const today = new Date();
  return new Date(someDate).toDateString() === today.toDateString();
};

// Helper: Upload Stream ke Cloudinary (Images & Wallpapers)
const streamUpload = (buffer, folder) => {
  return new Promise((resolve, reject) => {
    // FIX: Cegah crash jika buffer undefined
    if (!buffer) {
      return reject(new Error("File buffer is missing or empty"));
    }

    const stream = cloudinary.uploader.upload_stream({ folder: folder }, (error, result) => {
      if (result) resolve(result); else reject(error);
    });
    
    try {
      Readable.from(buffer).pipe(stream);
    } catch (err) {
      reject(err);
    }
  });
};

const sendMessage = async (req, res) => {
  try {
    const { receiverId, message, type } = req.body;
    
    // Normalisasi input string dari FormData
    let replyTo = req.body.replyTo;
    if (replyTo === 'null' || replyTo === 'undefined' || replyTo === '') replyTo = null;

    let isDisappearing = req.body.isDisappearing;
    if (typeof isDisappearing === 'string') isDisappearing = isDisappearing === 'true';

    const senderId = req.user.id;
    let chatData = { sender: senderId, receiver: receiverId, replyTo, type: type || 'text' };

    // --- LOGIKA UPLOAD FILE ---
    if (req.file) {
      // Validasi Buffer
      if (!req.file.buffer) {
        return res.status(400).json({ message: 'File upload failed: Buffer is empty' });
      }

      // 1. Jika Image -> Upload ke CLOUDINARY
      if (type === 'image') {
        const result = await streamUpload(req.file.buffer, 'wapps_chat_images');
        chatData.fileInfo = { 
          url: result.secure_url, 
          name: req.file.originalname, 
          size: req.file.size, 
          mimeType: req.file.mimetype 
        };
        chatData.message = message || 'Image';
      
      // 2. Jika File (Zip, Pdf, dll) -> Upload ke CATBOX.MOE
      } else if (type === 'file') {
        try {
          const form = new FormData();
          form.append('reqtype', 'fileupload');
          
          if (process.env.CATBOX_USER_HASH) {
            form.append('userhash', process.env.CATBOX_USER_HASH);
          }
          
          // Penting: Masukkan filename agar Catbox mengenali ekstensi
          form.append('fileToUpload', req.file.buffer, req.file.originalname);

          const response = await axios.post('https://catbox.moe/user/api.php', form, { 
            headers: form.getHeaders() 
          });

          const fileUrl = response.data; // Raw URL string

          chatData.fileInfo = { 
            url: fileUrl.toString().trim(), 
            name: req.file.originalname, 
            size: req.file.size, 
            mimeType: req.file.mimetype 
          };
          chatData.message = message || req.file.originalname;
        } catch (catboxError) {
          console.error("Catbox Upload Error:", catboxError.message);
          return res.status(500).json({ message: "Failed to upload file to external server" });
        }
      }
    } else {
      // Jika Text biasa (tanpa file)
      if (!message) return res.status(400).json({ message: 'Message is required for text type' });
      chatData.message = message;
    }

    // Handle Disappearing Messages
    if (isDisappearing) {
      chatData.expireAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    }
    
    // Simpan Chat ke Database
    const newChat = await Chat.create(chatData);

    // Update Misi Harian
    const senderUser = await User.findById(senderId);
    if (senderUser.missionProgress && !isToday(senderUser.missionProgress.messagesSent.lastClaim)) {
        senderUser.missionProgress.messagesSent.count = (senderUser.missionProgress.messagesSent.count || 0) + 1;
        await senderUser.save();
    }

    // Populate Data
    const fullChat = await Chat.findById(newChat._id)
      .populate('sender', 'username profilePic')
      .populate('replyTo', 'message sender');
      
    res.status(201).json(fullChat);

  } catch (error) {
    console.error("Send Message Critical Error:", error);
    res.status(500).json({ message: error.message || 'Internal Server Error' });
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
      if (!req.file.buffer) return res.status(400).json({ message: 'File buffer missing' });
      
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