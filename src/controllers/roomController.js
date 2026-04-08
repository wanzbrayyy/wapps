const mongoose = require('mongoose');
const Room = require('../models/room');
const RoomMessage = require('../models/roomMessage');
const User = require('../models/user');
const { createNotification } = require('../services/notificationService');

const isToday = (someDate) => {
  if (!someDate) return false;
  const today = new Date();
  return new Date(someDate).toDateString() === today.toDateString();
};

const populateRoomQuery = (query) => query
  .populate('creator', 'username profilePic fullName')
  .populate('participants', 'username profilePic fullName')
  .populate('admins', 'username fullName profilePic')
  .populate('moderators', 'username fullName profilePic')
  .populate('events.createdBy', 'username')
  .populate({
    path: 'pinnedMessage',
    populate: [
      { path: 'sender', select: 'username profilePic fullName' },
      { path: 'mentions', select: 'username fullName profilePic' },
      {
        path: 'replyTo',
        populate: { path: 'sender', select: 'username profilePic fullName' }
      }
    ]
  });

const populateRoomMessageQuery = (query) => query
  .populate('sender', 'username profilePic fullName')
  .populate('mentions', 'username fullName profilePic')
  .populate({
    path: 'replyTo',
    populate: { path: 'sender', select: 'username profilePic fullName' }
  })
  .populate('pinnedBy', 'username fullName');

const roomHasUser = (room, userId, field = 'participants') =>
  (room[field] || []).some((entry) => entry.toString() === userId);

const canManageRoom = (room, userId) =>
  room.creator.toString() === userId ||
  roomHasUser(room, userId, 'admins') ||
  roomHasUser(room, userId, 'moderators');

const resolveMentionedUserIds = (room, message, mentionedUserIds = []) => {
  const participantIds = new Set((room.participants || []).map((userId) => userId.toString()));
  const explicitIds = Array.isArray(mentionedUserIds)
    ? mentionedUserIds.filter(Boolean).map((userId) => userId.toString())
    : [];

  const regex = /@([a-zA-Z0-9_]+)/g;
  const usernamesInText = [];
  let match = regex.exec(message || '');
  while (match) {
    usernamesInText.push(match[1].toLowerCase());
    match = regex.exec(message || '');
  }

  const matchedIds = (room.participants || [])
    .filter((participant) => {
      const username = participant.username || '';
      return usernamesInText.includes(username.toLowerCase());
    })
    .map((participant) => participant._id.toString());

  return [...new Set([...explicitIds, ...matchedIds])]
    .filter((userId) => participantIds.has(userId));
};

const attachThreadCounts = (messages) => {
  const counts = {};
  messages.forEach((message) => {
    if (message.threadRoot) {
      const key = message.threadRoot.toString();
      counts[key] = (counts[key] || 0) + 1;
    }
  });

  return messages.map((message) => {
    const serialized = message.toObject ? message.toObject() : message;
    serialized.threadReplyCount = counts[serialized._id.toString()] || 0;
    return serialized;
  });
};

const createRoom = async (req, res) => {
  try {
    const { title, category, description, roomImage } = req.body;
    const resolvedRoomImage = req.file?.path || roomImage;
    const newRoom = await Room.create({
      title,
      category,
      description,
      roomImage: resolvedRoomImage,
      creator: req.user.id,
      participants: [req.user.id],
      admins: [req.user.id]
    });
    res.status(201).json(newRoom);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const updateRoomImage = async (req, res) => {
  try {
    const { roomId, imageUrl } = req.body;
    const room = await Room.findById(roomId);
    if (!room) return res.status(404).json({ message: 'Room not found' });
    if (!canManageRoom(room, req.user.id)) return res.status(403).json({ message: 'Not authorized' });

    room.roomImage = req.file?.path || imageUrl || room.roomImage;
    await room.save();
    res.json(await populateRoomQuery(Room.findById(room._id)));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getAllRooms = async (req, res) => {
  try {
    const rooms = await Room.find({ isActive: true })
      .populate('creator', 'username profilePic')
      .populate('participants', 'username profilePic')
      .populate({
        path: 'pinnedMessage',
        populate: { path: 'sender', select: 'username profilePic fullName' }
      })
      .sort({ createdAt: -1 });
    res.json(rooms);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getRoomById = async (req, res) => {
  try {
    const room = await populateRoomQuery(Room.findById(req.params.id));
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
    if (roomHasUser(room, req.user.id, 'bannedUsers')) return res.status(403).json({ message: 'You are banned from this room' });

    if (!roomHasUser(room, req.user.id)) {
      room.participants.push(req.user.id);
      await room.save();

      const user = await User.findById(req.user.id);
      if (user.missionProgress && !isToday(user.missionProgress.roomsJoined.lastClaim)) {
        user.missionProgress.roomsJoined.count = (user.missionProgress.roomsJoined.count || 0) + 1;
        await user.save();
      }
    }

    res.json(await populateRoomQuery(Room.findById(room._id)));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const leaveRoom = async (req, res) => {
  try {
    const room = await Room.findById(req.params.id);
    if (!room) return res.status(404).json({ message: 'Room not found' });

    room.participants = room.participants.filter((id) => id.toString() !== req.user.id);
    room.admins = room.admins.filter((id) => id.toString() !== req.user.id);
    room.moderators = room.moderators.filter((id) => id.toString() !== req.user.id);
    await room.save();

    res.json({ message: 'Left room successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const assignRole = async (req, res) => {
  try {
    const { userId, role } = req.body;
    const room = await Room.findById(req.params.id);
    if (!room) return res.status(404).json({ message: 'Room not found' });
    if (!roomHasUser(room, req.user.id, 'admins')) return res.status(403).json({ message: 'Not authorized' });

    if (role === 'admin' && !roomHasUser(room, userId, 'admins')) room.admins.push(userId);
    else if (role === 'moderator' && !roomHasUser(room, userId, 'moderators')) room.moderators.push(userId);

    await room.save();
    res.json(await populateRoomQuery(Room.findById(room._id)));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const kickUser = async (req, res) => {
  try {
    const { userId } = req.body;
    const room = await Room.findById(req.params.id);
    if (!room) return res.status(404).json({ message: 'Room not found' });
    if (!canManageRoom(room, req.user.id)) return res.status(403).json({ message: 'Not authorized' });

    room.participants = room.participants.filter((id) => id.toString() !== userId);
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
    if (!roomHasUser(room, req.user.id, 'admins')) return res.status(403).json({ message: 'Admins only' });

    room.participants = room.participants.filter((id) => id.toString() !== userId);
    if (!roomHasUser(room, userId, 'bannedUsers')) room.bannedUsers.push(userId);
    await room.save();

    res.json({ message: 'User banned' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const sendGift = async (req, res) => {
  try {
    const { amount } = req.body;
    const sender = await User.findById(req.user.id);
    const room = await Room.findById(req.params.id);
    if (!room) return res.status(404).json({ message: 'Room not found' });

    const host = await User.findById(room.creator);
    if (sender.coins < amount) return res.status(400).json({ message: 'Insufficient coins' });

    sender.coins -= amount;
    host.coins += amount;

    if (sender.missionProgress && !isToday(sender.missionProgress.giftSent.lastClaim)) {
      sender.missionProgress.giftSent.count = (sender.missionProgress.giftSent.count || 0) + 1;
    }

    await sender.save();
    await host.save();
    await RoomMessage.create({
      room: req.params.id,
      sender: req.user.id,
      message: `Sent a gift of ${amount} coins!`,
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
    if (!roomHasUser(room, req.user.id, 'admins')) return res.status(403).json({ message: 'Not authorized' });

    room.events.push({ title, date, description, createdBy: req.user.id });
    await room.save();

    res.json(room.events);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const sendRoomMessage = async (req, res) => {
  try {
    const { message = '', type = 'text', replyTo, mentionedUserIds, gifUrl, stickerId, stickerLabel, stickerUrl } = req.body;
    const room = await Room.findById(req.params.id).populate('participants', 'username');
    if (!room) return res.status(404).json({ message: 'Room not found' });
    if (!roomHasUser(room, req.user.id)) return res.status(403).json({ message: 'Join the room first' });

    let replyMessage = null;
    if (replyTo && mongoose.Types.ObjectId.isValid(replyTo)) {
      replyMessage = await RoomMessage.findOne({ _id: replyTo, room: room._id });
      if (!replyMessage) return res.status(404).json({ message: 'Reply target not found' });
    }

    const resolvedType = ['gif', 'sticker', 'image', 'system'].includes(type) ? type : 'text';
    const mentionIds = resolveMentionedUserIds(room, message, mentionedUserIds);

    const payload = {
      room: room._id,
      sender: req.user.id,
      message,
      type: resolvedType,
      mentions: mentionIds,
      replyTo: replyMessage?._id || null,
      threadRoot: replyMessage ? (replyMessage.threadRoot || replyMessage._id) : null
    };

    if (resolvedType === 'gif') {
      payload.fileInfo = {
        url: gifUrl || '',
        label: message || 'GIF'
      };
      payload.message = message || 'Shared a GIF';
    }

    if (resolvedType === 'sticker') {
      payload.fileInfo = {
        url: stickerUrl || '',
        stickerId: stickerId || '',
        label: stickerLabel || 'Sticker'
      };
      payload.message = message || stickerLabel || 'Sent a sticker';
    }

    if (resolvedType === 'text' && !payload.message.trim()) {
      return res.status(400).json({ message: 'Message is required' });
    }

    const newMsg = await RoomMessage.create(payload);

    const user = await User.findById(req.user.id);
    if (user.missionProgress && !isToday(user.missionProgress.roomMessageSent.lastClaim)) {
      user.missionProgress.roomMessageSent.count = (user.missionProgress.roomMessageSent.count || 0) + 1;
      await user.save();
    }

    if (mentionIds.length > 0) {
      await Promise.all(
        mentionIds
          .filter((userId) => userId !== req.user.id)
          .map((mentionedUserId) => createNotification({
            userId: mentionedUserId,
            actorId: req.user.id,
            title: 'Room mention',
            body: `${req.user.username} mentioned you in ${room.title}`,
            type: 'room_mention',
            data: {
              roomId: room._id.toString(),
              messageId: newMsg._id.toString()
            }
          }))
      );
    }

    if (replyMessage && replyMessage.sender.toString() !== req.user.id) {
      await createNotification({
        userId: replyMessage.sender,
        actorId: req.user.id,
        title: 'Thread reply',
        body: `${req.user.username} replied to your room message`,
        type: 'room_reply',
        data: {
          roomId: room._id.toString(),
          messageId: newMsg._id.toString(),
          threadRootId: (replyMessage.threadRoot || replyMessage._id).toString()
        }
      });
    }

    const fullMsg = await populateRoomMessageQuery(RoomMessage.findById(newMsg._id));
    res.status(201).json(fullMsg);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getRoomMessages = async (req, res) => {
  try {
    const messages = await populateRoomMessageQuery(
      RoomMessage.find({ room: req.params.id }).sort({ createdAt: 1 })
    );

    res.json(attachThreadCounts(messages));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getThreadMessages = async (req, res) => {
  try {
    const rootMessage = await RoomMessage.findOne({
      _id: req.params.messageId,
      room: req.params.id
    });
    if (!rootMessage) return res.status(404).json({ message: 'Thread root not found' });

    const threadRootId = rootMessage.threadRoot || rootMessage._id;
    const threadMessages = await populateRoomMessageQuery(
      RoomMessage.find({
        room: req.params.id,
        $or: [{ _id: threadRootId }, { threadRoot: threadRootId }]
      }).sort({ createdAt: 1 })
    );

    res.json(attachThreadCounts(threadMessages));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const pinRoomMessage = async (req, res) => {
  try {
    const room = await Room.findById(req.params.id);
    if (!room) return res.status(404).json({ message: 'Room not found' });
    if (!canManageRoom(room, req.user.id)) return res.status(403).json({ message: 'Not authorized' });

    const roomMessage = await RoomMessage.findOne({
      _id: req.params.messageId,
      room: room._id
    });
    if (!roomMessage) return res.status(404).json({ message: 'Message not found' });

    await RoomMessage.updateMany(
      { room: room._id, isPinned: true },
      { $set: { isPinned: false, pinnedAt: null, pinnedBy: null } }
    );

    roomMessage.isPinned = true;
    roomMessage.pinnedAt = new Date();
    roomMessage.pinnedBy = req.user.id;
    await roomMessage.save();

    room.pinnedMessage = roomMessage._id;
    await room.save();

    await Promise.all(
      (room.participants || [])
        .map((participantId) => participantId.toString())
        .filter((participantId) => participantId !== req.user.id)
        .map((participantId) => createNotification({
          userId: participantId,
          actorId: req.user.id,
          title: 'Pinned room message',
          body: `${req.user.username} pinned a message in ${room.title}`,
          type: 'room_pin',
          data: {
            roomId: room._id.toString(),
            messageId: roomMessage._id.toString()
          }
        }))
    );

    res.json(await populateRoomQuery(Room.findById(room._id)));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const unpinRoomMessage = async (req, res) => {
  try {
    const room = await Room.findById(req.params.id);
    if (!room) return res.status(404).json({ message: 'Room not found' });
    if (!canManageRoom(room, req.user.id)) return res.status(403).json({ message: 'Not authorized' });

    if (room.pinnedMessage) {
      await RoomMessage.findByIdAndUpdate(room.pinnedMessage, {
        $set: { isPinned: false, pinnedAt: null, pinnedBy: null }
      });
    }

    room.pinnedMessage = null;
    await room.save();

    res.json(await populateRoomQuery(Room.findById(room._id)));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  createRoom,
  updateRoomImage,
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
  getRoomMessages,
  getThreadMessages,
  pinRoomMessage,
  unpinRoomMessage
};
