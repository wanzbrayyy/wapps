const mongoose = require('mongoose');
const axios = require('axios');
const FormData = require('form-data');
const { Readable } = require('stream');
const Chat = require('../models/chat');
const ChatPreference = require('../models/chatPreference');
const User = require('../models/user');
const cloudinary = require('../config/cloudinary');
const { createNotification } = require('../services/notificationService');

const isToday = (someDate) => {
  if (!someDate) return false;
  const today = new Date();
  return new Date(someDate).toDateString() === today.toDateString();
};

const streamUpload = (buffer, folder, resourceType = 'auto') => {
  return new Promise((resolve, reject) => {
    if (!buffer) return reject(new Error('Upload failed: Buffer is empty'));

    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: resourceType },
      (error, result) => {
        if (result) resolve(result);
        else reject(error);
      }
    );

    try {
      Readable.from(buffer).pipe(stream);
    } catch (err) {
      reject(err);
    }
  });
};

const enrichChat = (query) => query
  .populate('sender', 'username profilePic fullName')
  .populate('replyTo', 'message sender type fileInfo')
  .populate('forwardedFrom', 'message sender type fileInfo')
  .populate('reactions.user', 'username');

const normalizeChatType = (type) => {
  const supported = ['text', 'image', 'file', 'audio', 'video', 'gif', 'sticker', 'location', 'system'];
  return supported.includes(type) ? type : 'text';
};

const buildForwardedPayload = async ({ forwardFrom, message, senderId, receiverId }) => {
  if (!forwardFrom) return null;

  const original = await Chat.findById(forwardFrom);
  if (!original) throw new Error('Original message not found');

  return {
    sender: senderId,
    receiver: receiverId,
    message: message || original.message || 'Forwarded message',
    type: original.type,
    fileInfo: original.fileInfo,
    location: original.location,
    forwardedFrom: original._id,
    replyTo: null
  };
};

const uploadMultipartFile = async (req, type, message) => {
  if (!req.file) return {};

  if (req.file.buffer && ['image', 'audio', 'video'].includes(type)) {
    const resourceType = type === 'image' ? 'image' : 'video';
    const folder = `wapps_chat_${type}s`;
    const result = await streamUpload(req.file.buffer, folder, resourceType);

    return {
      fileInfo: {
        url: result.secure_url,
        name: req.file.originalname,
        size: req.file.size,
        mimeType: req.file.mimetype,
        duration: req.body.duration ? parseFloat(req.body.duration) : (result.duration || 0),
        thumbnail: type === 'video' ? result.secure_url.replace(/\.[^/.]+$/, '.jpg') : null
      },
      message: message || type.charAt(0).toUpperCase() + type.slice(1)
    };
  }

  if (req.file.buffer && type === 'file') {
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

      return {
        fileInfo: {
          url: response.data.toString().trim(),
          name: req.file.originalname,
          size: req.file.size,
          mimeType: req.file.mimetype
        },
        message: message || req.file.originalname
      };
    } catch (catboxError) {
      const result = await streamUpload(req.file.buffer, 'wapps_chat_files', 'raw');
      return {
        fileInfo: {
          url: result.secure_url,
          name: req.file.originalname,
          size: req.file.size,
          mimeType: req.file.mimetype
        },
        message: message || req.file.originalname
      };
    }
  }

  return {
    fileInfo: {
      url: req.file.path || req.file.secure_url || '',
      name: req.file.originalname,
      size: req.file.size,
      mimeType: req.file.mimetype
    },
    message: message || req.file.originalname
  };
};

const createMessageNotification = async ({ senderId, receiverId, senderName, messageType, messageId }) => {
  if (!receiverId || senderId === receiverId.toString()) return;

  const bodyMap = {
    text: `${senderName} sent you a message`,
    gif: `${senderName} sent you a GIF`,
    sticker: `${senderName} sent you a sticker`,
    image: `${senderName} sent you a photo`,
    video: `${senderName} sent you a video`,
    audio: `${senderName} sent you an audio message`,
    file: `${senderName} sent you a file`
  };

  await createNotification({
    userId: receiverId,
    actorId: senderId,
    title: 'New message',
    body: bodyMap[messageType] || `${senderName} sent you a message`,
    type: 'chat_message',
    data: {
      chatUserId: senderId.toString(),
      messageId: messageId.toString()
    }
  });
};

const sendMessage = async (req, res) => {
  try {
    const {
      receiverId,
      message,
      type,
      latitude,
      longitude,
      address,
      forwardFrom,
      mediaUrl,
      stickerId,
      stickerLabel
    } = req.body;

    const senderId = req.user.id;
    const resolvedType = normalizeChatType(type || 'text');
    let replyTo = req.body.replyTo;
    if (!replyTo || replyTo === 'null' || replyTo === 'undefined') replyTo = null;

    let isDisappearing = req.body.isDisappearing;
    if (typeof isDisappearing === 'string') isDisappearing = isDisappearing === 'true';

    let chatData = await buildForwardedPayload({ forwardFrom, message, senderId, receiverId });

    if (!chatData) {
      chatData = {
        sender: senderId,
        receiver: receiverId,
        replyTo,
        type: resolvedType
      };

      if (resolvedType === 'location') {
        chatData.location = {
          latitude: parseFloat(latitude),
          longitude: parseFloat(longitude),
          address: address || ''
        };
        chatData.message = 'Shared a location';
      } else if (resolvedType === 'gif') {
        chatData.fileInfo = {
          url: mediaUrl || '',
          name: 'gif',
          mimeType: 'image/gif'
        };
        chatData.message = message || 'GIF';
      } else if (resolvedType === 'sticker') {
        chatData.fileInfo = {
          url: mediaUrl || '',
          name: stickerLabel || 'Sticker',
          mimeType: 'image/png',
          thumbnail: mediaUrl || '',
          stickerId: stickerId || ''
        };
        chatData.message = message || stickerLabel || 'Sticker';
      } else if (!req.file) {
        if (!message) {
          return res.status(400).json({ message: 'Message content is required' });
        }
        chatData.message = message;
      }
    }

    if (req.file) {
      const uploadedPayload = await uploadMultipartFile(req, resolvedType, message);
      chatData.fileInfo = uploadedPayload.fileInfo;
      chatData.message = uploadedPayload.message;
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

      await createMessageNotification({
        senderId,
        receiverId,
        senderName: senderUser?.username || req.user.username || 'Someone',
        messageType: chatData.type,
        messageId: newChat._id
      });
    } catch (ignore) {
      console.error('Message side effect error', ignore);
    }

    const fullChat = await enrichChat(Chat.findById(newChat._id));
    res.status(201).json(fullChat);
  } catch (error) {
    console.error('SendMessage Error:', error);
    res.status(500).json({ message: error.message || 'Internal Server Error' });
  }
};

const forwardMessage = async (req, res) => {
  try {
    const { receiverId, sourceChatId, message } = req.body;
    req.body.receiverId = receiverId;
    req.body.forwardFrom = sourceChatId;
    req.body.message = message;
    req.body.type = undefined;
    await sendMessage(req, res);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const addReaction = async (req, res) => {
  try {
    const { chatId, type } = req.body;
    const chat = await Chat.findById(chatId);
    if (!chat) return res.status(404).json({ message: 'Chat not found' });

    chat.reactions = chat.reactions.filter((reaction) => reaction.user.toString() !== req.user.id);
    chat.reactions.push({ user: req.user.id, type });
    await chat.save();

    res.json(chat);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const editMessage = async (req, res) => {
  try {
    const { chatId } = req.params;
    const { message } = req.body;
    const chat = await Chat.findById(chatId);

    if (!chat) return res.status(404).json({ message: 'Chat not found' });
    if (chat.sender.toString() !== req.user.id) return res.status(403).json({ message: 'Not authorized' });
    if (chat.deletedForEveryone) return res.status(400).json({ message: 'Deleted message cannot be edited' });
    if (!['text', 'system'].includes(chat.type)) return res.status(400).json({ message: 'Only text messages can be edited' });

    chat.message = message;
    chat.editedAt = new Date();
    await chat.save();

    const fullChat = await enrichChat(Chat.findById(chat._id));
    res.json(fullChat);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const deleteMessage = async (req, res) => {
  try {
    const { chatId } = req.params;
    const { scope = 'me' } = req.body;
    const chat = await Chat.findById(chatId);

    if (!chat) return res.status(404).json({ message: 'Chat not found' });

    if (scope === 'everyone') {
      if (chat.sender.toString() !== req.user.id) {
        return res.status(403).json({ message: 'Only sender can delete for everyone' });
      }

      chat.deletedForEveryone = true;
      chat.message = 'This message was deleted';
      chat.fileInfo = undefined;
      chat.location = undefined;
      chat.forwardedFrom = null;
      await chat.save();
    } else {
      if (!chat.deletedFor.some((userId) => userId.toString() === req.user.id)) {
        chat.deletedFor.push(req.user.id);
        await chat.save();
      }
    }

    const fullChat = await enrichChat(Chat.findById(chat._id));
    res.json({
      message: scope === 'everyone' ? 'Message deleted for everyone' : 'Message deleted for you',
      chat: fullChat
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const toggleStarMessage = async (req, res) => {
  try {
    const { chatId, starred } = req.body;
    const chat = await Chat.findById(chatId);
    if (!chat) return res.status(404).json({ message: 'Chat not found' });

    const alreadyStarred = chat.starredBy.some((userId) => userId.toString() === req.user.id);
    if ((starred ?? !alreadyStarred) && !alreadyStarred) {
      chat.starredBy.push(req.user.id);
    } else {
      chat.starredBy = chat.starredBy.filter((userId) => userId.toString() !== req.user.id);
    }

    await chat.save();
    res.json({
      message: 'Star status updated',
      starred: chat.starredBy.some((userId) => userId.toString() === req.user.id)
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const bulkMessageAction = async (req, res) => {
  try {
    const { chatIds = [], action, targetUserId } = req.body;
    if (!Array.isArray(chatIds) || chatIds.length === 0) {
      return res.status(400).json({ message: 'chatIds is required' });
    }

    const chats = await Chat.find({
      _id: { $in: chatIds },
      $or: [{ sender: req.user.id }, { receiver: req.user.id }]
    }).sort({ createdAt: 1 });

    if (chats.length === 0) return res.status(404).json({ message: 'No chats found' });

    if (action === 'delete_me') {
      await Chat.updateMany(
        { _id: { $in: chats.map((chat) => chat._id) } },
        { $addToSet: { deletedFor: req.user.id } }
      );
      return res.json({ message: 'Messages deleted for you', processed: chats.length });
    }

    if (action === 'delete_everyone') {
      const ownChats = chats.filter((chat) => chat.sender.toString() === req.user.id);
      await Promise.all(
        ownChats.map((chat) => {
          chat.deletedForEveryone = true;
          chat.message = 'This message was deleted';
          chat.fileInfo = undefined;
          chat.location = undefined;
          chat.forwardedFrom = null;
          return chat.save();
        })
      );

      return res.json({ message: 'Messages deleted for everyone', processed: ownChats.length });
    }

    if (action === 'star' || action === 'unstar') {
      await Promise.all(
        chats.map((chat) => {
          if (action === 'star') {
            if (!chat.starredBy.some((userId) => userId.toString() === req.user.id)) {
              chat.starredBy.push(req.user.id);
            }
          } else {
            chat.starredBy = chat.starredBy.filter((userId) => userId.toString() !== req.user.id);
          }
          return chat.save();
        })
      );

      return res.json({
        message: action === 'star' ? 'Messages starred' : 'Messages unstarred',
        processed: chats.length
      });
    }

    if (action === 'forward') {
      if (!targetUserId) return res.status(400).json({ message: 'targetUserId is required for forward' });

      const forwarded = [];
      for (const chat of chats) {
        const payload = await buildForwardedPayload({
          forwardFrom: chat._id,
          message: chat.message,
          senderId: req.user.id,
          receiverId: targetUserId
        });
        const newChat = await Chat.create(payload);
        forwarded.push(newChat);
      }

      return res.json({ message: 'Messages forwarded', processed: forwarded.length });
    }

    return res.status(400).json({ message: 'Unsupported bulk action' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getMessages = async (req, res) => {
  try {
    const { userId } = req.params;
    const myId = req.user.id;
    const { search } = req.query;

    const query = {
      $or: [{ sender: myId, receiver: userId }, { sender: userId, receiver: myId }],
      deletedFor: { $ne: myId }
    };

    if (search) {
      query.message = { $regex: search, $options: 'i' };
    }

    const messages = await enrichChat(
      Chat.find(query).sort({ createdAt: 1 })
    );

    await Chat.updateMany(
      { sender: userId, receiver: myId, isRead: false, deletedFor: { $ne: myId } },
      { $set: { isRead: true, readAt: new Date() } }
    );

    res.json(messages);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const setChatPreference = async (req, res) => {
  try {
    const { targetUserId, isPinned, isArchived, isMuted } = req.body;
    let wallpaperUrl;

    if (req.file) {
      if (req.file.buffer) {
        const result = await streamUpload(req.file.buffer, 'wapps_wallpapers', 'image');
        wallpaperUrl = result.secure_url;
      } else {
        wallpaperUrl = req.file.path || req.file.secure_url;
      }
    }

    const updateData = {};
    if (wallpaperUrl) updateData.wallpaper = wallpaperUrl;
    if (isPinned !== undefined) updateData.isPinned = isPinned === 'true' || isPinned === true;
    if (isArchived !== undefined) updateData.isArchived = isArchived === 'true' || isArchived === true;
    if (isMuted !== undefined) updateData.isMuted = isMuted === 'true' || isMuted === true;

    const pref = await ChatPreference.findOneAndUpdate(
      { user: req.user.id, targetUser: targetUserId },
      { $set: updateData },
      { new: true, upsert: true }
    );

    res.json(pref);
  } catch (error) {
    console.error('Preference Error:', error);
    res.status(500).json({ message: error.message });
  }
};

const getConversations = async (req, res) => {
  try {
    const currentUserId = new mongoose.Types.ObjectId(req.user.id);
    const includeArchived = req.query.includeArchived === 'true';
    const prefs = await ChatPreference.find({ user: req.user.id });
    const prefMap = new Map(prefs.map((pref) => [pref.targetUser.toString(), pref]));

    const conversations = await Chat.aggregate([
      {
        $match: {
          $or: [{ sender: currentUserId }, { receiver: currentUserId }],
          deletedFor: { $ne: currentUserId }
        }
      },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: {
            $cond: [{ $eq: ['$sender', currentUserId] }, '$receiver', '$sender']
          },
          lastMessage: { $first: '$$ROOT' },
          unreadCount: {
            $sum: {
              $cond: [
                { $and: [{ $eq: ['$receiver', currentUserId] }, { $eq: ['$isRead', false] }] },
                1,
                0
              ]
            }
          }
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'userDetails'
        }
      },
      { $unwind: '$userDetails' },
      {
        $project: {
          userId: '$userDetails._id',
          username: '$userDetails.username',
          fullName: '$userDetails.fullName',
          profilePic: '$userDetails.profilePic',
          isOnline: '$userDetails.isOnline',
          lastMessageContent: '$lastMessage.message',
          lastMessageType: '$lastMessage.type',
          timestamp: '$lastMessage.createdAt',
          unreadCount: 1
        }
      }
    ]);

    const results = conversations
      .map((conversation) => {
        let preview = conversation.lastMessageContent;
        if (conversation.lastMessageType !== 'text') {
          if (conversation.lastMessageType === 'image') preview = 'Image';
          else if (conversation.lastMessageType === 'video') preview = 'Video';
          else if (conversation.lastMessageType === 'audio') preview = 'Audio';
          else if (conversation.lastMessageType === 'file') preview = 'File';
          else if (conversation.lastMessageType === 'location') preview = 'Location';
          else if (conversation.lastMessageType === 'gif') preview = 'GIF';
          else if (conversation.lastMessageType === 'sticker') preview = 'Sticker';
          else if (conversation.lastMessageType === 'system') preview = conversation.lastMessageContent || 'System message';
        }

        const pref = prefMap.get(conversation.userId.toString());
        return {
          userId: conversation.userId,
          username: conversation.username,
          fullName: conversation.fullName,
          profilePic: conversation.profilePic,
          isOnline: conversation.isOnline || false,
          lastMessage: preview || '',
          timestamp: conversation.timestamp,
          unreadCount: conversation.unreadCount,
          isPinned: pref?.isPinned || false,
          isArchived: pref?.isArchived || false,
          isMuted: pref?.isMuted || false
        };
      })
      .filter((conversation) => includeArchived || !conversation.isArchived);

    results.sort((a, b) => {
      if (a.isPinned === b.isPinned) {
        return new Date(b.timestamp) - new Date(a.timestamp);
      }
      return a.isPinned ? -1 : 1;
    });

    res.json(results);
  } catch (error) {
    console.error('Get Conversations Error:', error);
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  sendMessage,
  forwardMessage,
  editMessage,
  deleteMessage,
  toggleStarMessage,
  bulkMessageAction,
  getMessages,
  getConversations,
  addReaction,
  setChatPreference
};
