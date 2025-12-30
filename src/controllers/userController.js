const User = require('../models/user');
const cloudinary = require('../config/cloudinary');
const fs = require('fs');

const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .select('-password')
      .populate('followers', 'username profilePic fullName')
      .populate('following', 'username profilePic fullName');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .select('-password -resetPasswordToken -resetPasswordExpire')
      .populate('followers', 'username profilePic')
      .populate('following', 'username profilePic');

    if (!user) return res.status(404).json({ message: 'User not found' });

    const isFollowing = user.followers.some(
      (follower) => follower._id.toString() === req.user.id
    );

    res.json({ ...user.toObject(), isFollowing });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const updateProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    user.fullName = req.body.fullName || user.fullName;
    user.bio = req.body.bio || user.bio;
    
    if (req.body.username && req.body.username !== user.username) {
        const exists = await User.findOne({ username: req.body.username });
        if(exists) return res.status(400).json({ message: "Username already taken"});
        user.username = req.body.username;
    }

    const updatedUser = await user.save();
    res.json({
      _id: updatedUser._id,
      username: updatedUser.username,
      fullName: updatedUser.fullName,
      bio: updatedUser.bio,
      profilePic: updatedUser.profilePic
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const uploadProfilePic = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

    const user = await User.findById(req.user.id);
    
    if (user.cloudinaryId) {
      await cloudinary.uploader.destroy(user.cloudinaryId);
    }

    // Handle stream upload logic if using memory storage (for Vercel)
    const streamUpload = (buffer) => {
        return new Promise((resolve, reject) => {
            let stream = cloudinary.uploader.upload_stream(
              { folder: process.env.CLOUDINARY_UPLOAD_FOLDER },
              (error, result) => {
                if (result) { resolve(result); } else { reject(error); }
              }
            );
            const { Readable } = require('stream');
            Readable.from(buffer).pipe(stream);
        });
    };

    let result;
    if (req.file.buffer) {
        result = await streamUpload(req.file.buffer);
    } else {
        result = await cloudinary.uploader.upload(req.file.path, {
            folder: process.env.CLOUDINARY_UPLOAD_FOLDER,
        });
        if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    }

    user.profilePic = result.secure_url;
    user.cloudinaryId = result.public_id;
    await user.save();

    res.json({ profilePic: user.profilePic });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const followUser = async (req, res) => {
  try {
    if (req.user.id === req.params.id) {
      return res.status(400).json({ message: "You cannot follow yourself" });
    }

    const userToFollow = await User.findById(req.params.id);
    const currentUser = await User.findById(req.user.id);

    if (!userToFollow || !currentUser) {
      return res.status(404).json({ message: "User not found" });
    }

    if (!userToFollow.followers.includes(req.user.id)) {
      await userToFollow.updateOne({ $push: { followers: req.user.id } });
      await currentUser.updateOne({ $push: { following: req.params.id } });
      res.status(200).json({ message: "User followed" });
    } else {
      res.status(400).json({ message: "You already follow this user" });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const unfollowUser = async (req, res) => {
  try {
    if (req.user.id === req.params.id) {
      return res.status(400).json({ message: "You cannot unfollow yourself" });
    }

    const userToUnfollow = await User.findById(req.params.id);
    const currentUser = await User.findById(req.user.id);

    if (!userToUnfollow || !currentUser) {
      return res.status(404).json({ message: "User not found" });
    }

    if (userToUnfollow.followers.includes(req.user.id)) {
      await userToUnfollow.updateOne({ $pull: { followers: req.user.id } });
      await currentUser.updateOne({ $pull: { following: req.params.id } });
      res.status(200).json({ message: "User unfollowed" });
    } else {
      res.status(400).json({ message: "You are not following this user" });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getProfile,
  updateProfile,
  uploadProfilePic,
  getUserById,
  followUser,
  unfollowUser
};