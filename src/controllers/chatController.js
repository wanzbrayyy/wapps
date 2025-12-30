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
      .populate('sender', 'username profilePic fullName')
      .populate('receiver', 'username profilePic fullName');

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

    // Mark messages as read
    await Chat.updateMany(
      { sender: userId, receiver: myId, isRead: false },
      { $set: { isRead: true } }
    );

    res.json(messages);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getConversations = async (req, res) => {
  try {
    const currentUserId = req.user.id;
    
    // Agregasi untuk mendapatkan last message per user
    const conversations = await Chat.aggregate([
      {
        $match: {
          $or: [
            { sender: new mongoose.Types.ObjectId(currentUserId) },
            { receiver: new mongoose.Types.ObjectId(currentUserId) }
          ]
        }
      },
      {
        $sort: { createdAt: -1 }
      },
      {
        $group: {
          _id: {
            $cond: [
              { $eq: ["$sender", new mongoose.Types.ObjectId(currentUserId)] },
              "$receiver",
              "$sender"
            ]
          },
          lastMessage: { $first: "$message" },
          lastMessageId: { $first: "$_id" },
          timestamp: { $first: "$createdAt" },
          unreadCount: {
            $sum: {
              $cond: [
                { 
                  $and: [
                    { $eq: ["$receiver", new mongoose.Types.ObjectId(currentUserId)] },
                    { $eq: ["$isRead", false] }
                  ]
                },
                1,
                0
              ]
            }
          }
        }
      },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "userDetails"
        }
      },
      {
        $unwind: "$userDetails"
      },
      {
        $project: {
          userId: "$userDetails._id",
          username: "$userDetails.username",
          fullName: "$userDetails.fullName",
          profilePic: "$userDetails.profilePic",
          lastMessage: 1,
          timestamp: 1,
          unreadCount: 1
        }
      },
      {
        $sort: { timestamp: -1 }
      }
    ]);

    res.json(conversations);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const mongoose = require('mongoose');
module.exports = {
  sendMessage,
  getMessages,
  getConversations
};